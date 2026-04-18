import os
import csv
import hashlib
import datetime as dt
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from common.models import (
    AdministrativeUnit,
    AdministrativeUnitIdentity,
    Region,
    PostOffice,
    Shape,
    Lettering,
    Color,
    Postmark,
    PostmarkImage,
    DateObserved,
)
from postmarks.models import Location

DEFAULT_IMPORT_PATH = 'imports'

DATE_FMT_MAP = {
    'md': 'MD', 'mdd': 'MDD', 'yd': 'YD', 'ymd': 'YMD', 'ymdd': 'YMDD',
}


class Command(BaseCommand):
    help = 'Import ASCC data (states, raw state data, townmark images) from CSV directory into Django models'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dir', '-d',
            default=DEFAULT_IMPORT_PATH,
            help=f'Directory containing CSV files (default: {DEFAULT_IMPORT_PATH})',
        )
        parser.add_argument(
            '--user', '-u',
            default=None,
            help='Username for created_by/modified_by (default: first superuser, or id 2)',
        )

    def handle(self, *args, **options):
        User = get_user_model()
        self.import_path = os.path.normpath(options['dir'])
        if not os.path.isdir(self.import_path):
            self.stderr.write(self.style.ERROR(f'Directory not found: {self.import_path}'))
            return

        username = options.get('user')
        if username:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                self.stderr.write(self.style.ERROR(f'User not found: {username}'))
                return
        else:
            user = User.objects.filter(is_superuser=True).first()
            if not user:
                user = User.objects.filter(pk=2).first()
            if not user:
                self.stderr.write(self.style.ERROR('No user found. Create a superuser or pass --user.'))
                return
        self.user_id = user.pk
        self.stdout.write(f'Using user: {user.username} (id={self.user_id}), dir: {self.import_path}')

        self.state_by_id = {}
        self.region_by_abv = {}
        self.shape_cache = {}
        self.lettering_cache = {}
        self.color_cache = {}
        # Maps nRawStateDataID → Postmark pk for use by import_townmark_images
        self.listing_by_raw_id = {}

        self.import_states()
        self.import_raw_state_data()
        self.import_townmark_images()

    def import_states(self):
        filepath = os.path.join(self.import_path, 'tblStates.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                self.state_by_id[row['nStateID']] = row
                abv = row['txtStateAbv'].strip().upper()
                reference_code = f"US-{abv}"
                loc, created = Location.objects.get_or_create(
                    reference_code=reference_code,
                    defaults={
                        'created_by_id': self.user_id,
                        'modified_by_id': self.user_id,
                    },
                )
                AdministrativeUnitIdentity.objects.get_or_create(
                    administrative_unit=loc,
                    effective_from_date='1900-01-01',
                    defaults={
                        'created_by_id': self.user_id,
                        'modified_by_id': self.user_id,
                        'unit_name': row['txtState'],
                        'unit_abbreviation': abv,
                        'unit_type': 'STATE',
                        'hierarchy_level': 2,
                        'change_reason': 'INITIAL',
                    },
                )
                # Create/cache a Region for this state so postmarks can link via PostOffice
                region, _ = Region.objects.get_or_create(
                    abbrev=abv[:3],
                    region_tier='STATE',
                    defaults={
                        'name': row['txtState'],
                        'created_by_id': self.user_id,
                        'modified_by_id': self.user_id,
                    },
                )
                self.region_by_abv[abv] = region
                print(f"State {loc} {'created' if created else 'exists'}.")

    def _region_for_row(self, row):
        """Return Region for CSV row using nStateID lookup, or None."""
        n_state_id = row.get('nStateID')
        if not n_state_id or n_state_id not in self.state_by_id:
            return None
        state_row = self.state_by_id[n_state_id]
        abv = state_row.get('txtStateAbv', '').strip().upper()
        return self.region_by_abv.get(abv)

    def normalize_value(self, value, fallback='Unknown'):
        if value is None:
            return fallback
        value = str(value).strip()
        if value == '' or value.lower() in {'null', 'n/a', 'na', 'none'}:
            return fallback
        return value

    def parse_bool(self, value):
        return str(value).strip() in {'1', 'true', 'True', 'yes', 'Y'}

    def parse_date(self, day, month, year):
        if not year:
            return None
        try:
            year_int = int(str(year).strip())
        except ValueError:
            return None
        if year_int <= 0:
            return None
        month_str = str(month).strip() if month else ''
        month_map = {
            'jan': 1, 'january': 1,
            'feb': 2, 'february': 2,
            'mar': 3, 'march': 3,
            'apr': 4, 'april': 4,
            'may': 5,
            'jun': 6, 'june': 6,
            'jul': 7, 'july': 7,
            'aug': 8, 'august': 8,
            'sep': 9, 'sept': 9, 'september': 9,
            'oct': 10, 'october': 10,
            'nov': 11, 'november': 11,
            'dec': 12, 'december': 12,
        }
        month_int = month_map.get(month_str.lower(), 1)
        day_int = 1
        if day:
            try:
                day_int = int(str(day).strip())
            except ValueError:
                day_int = 1
        try:
            return dt.date(year_int, month_int, day_int)
        except ValueError:
            return None

    def _get_or_create_shape(self, raw_value):
        name = self.normalize_value(raw_value, 'Unknown')
        if name in self.shape_cache:
            return self.shape_cache[name]
        obj, _ = Shape.objects.get_or_create(
            name=name[:100],
            defaults={'created_by_id': self.user_id, 'modified_by_id': self.user_id},
        )
        self.shape_cache[name] = obj
        return obj

    def _get_or_create_lettering(self, raw_value):
        name = self.normalize_value(raw_value, 'Unknown')
        if name in self.lettering_cache:
            return self.lettering_cache[name]
        obj, _ = Lettering.objects.get_or_create(
            name=name[:100],
            defaults={'created_by_id': self.user_id, 'modified_by_id': self.user_id},
        )
        self.lettering_cache[name] = obj
        return obj

    def _get_or_create_color(self, raw_value):
        name = self.normalize_value(raw_value, '')
        if not name or name == 'Unknown':
            return None
        if name in self.color_cache:
            return self.color_cache[name]
        obj, _ = Color.objects.get_or_create(
            name=name[:50],
            defaults={
                'hex_val': '#FFFFFF',
                'created_by_id': self.user_id,
                'modified_by_id': self.user_id,
            },
        )
        self.color_cache[name] = obj
        return obj

    def _map_date_fmt(self, raw_value):
        if not raw_value:
            return None
        return DATE_FMT_MAP.get(str(raw_value).strip().lower())

    def import_raw_state_data(self):
        filepath = os.path.join(self.import_path, 'tblRawStateData.csv')
        code_seen = set(Postmark.objects.values_list('code', flat=True).exclude(code=None))

        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                raw_id = row.get('nRawStateDataID', '')
                region = self._region_for_row(row)

                # Build a unique code from the postmark key column
                base_code = self.normalize_value(row.get('txtPostmark'), raw_id)[:30]
                code = base_code
                suffix_n = 1
                while code in code_seen:
                    suffix = f"-{raw_id}"
                    code = base_code[:30 - len(suffix)] + suffix
                    suffix_n += 1
                    if suffix_n > 1:
                        break

                # Resolve FK lookups
                shape = self._get_or_create_shape(row.get('txtTownmarkShape'))
                lettering = self._get_or_create_lettering(row.get('txtTownmarkLettering'))
                color = self._get_or_create_color(row.get('txtTownmarkColor'))
                date_fmt = self._map_date_fmt(row.get('txtTownmarkDateFormat'))

                # PostOffice: get or create from region + town name
                post_office = None
                if region:
                    town = self.normalize_value(row.get('txtTown') or row.get('txtPostmark'), '')
                    if town and town != 'Unknown':
                        post_office, _ = PostOffice.objects.get_or_create(
                            name=town[:255],
                            region=region,
                            defaults={'created_by_id': self.user_id, 'modified_by_id': self.user_id},
                        )

                width_val = None
                height_val = None
                try:
                    width_val = float(row['nWidth']) if row.get('nWidth') else None
                except ValueError:
                    pass
                try:
                    height_val = float(row['nHeight']) if row.get('nHeight') else None
                except ValueError:
                    pass

                catalog_txt = row.get('txtPostmark') or ''
                inscription_txt = row.get('txtInscription') or row.get('txtOther') or ''

                listing, created = Postmark.objects.get_or_create(
                    code=code,
                    defaults={
                        'catalog_txt': catalog_txt[:],
                        'inscription_txt': inscription_txt,
                        'post_office': post_office,
                        'shape': shape,
                        'lettering': lettering,
                        'color': color,
                        'is_manuscript': self.parse_bool(row.get('ynManuscript')),
                        'width': width_val,
                        'height': height_val,
                        'date_fmt': date_fmt,
                        'created_by_id': self.user_id,
                        'modified_by_id': self.user_id,
                    },
                )
                code_seen.add(code)
                self.listing_by_raw_id[raw_id] = listing

                if created:
                    earliest_date = self.parse_date(
                        row.get('nEarliestUseDay'),
                        row.get('txtEarliestUseMonth'),
                        row.get('nEarliestUseYear') or row.get('txtEarliestUseYear'),
                    )
                    latest_date = self.parse_date(
                        row.get('nLatestUseDay'),
                        row.get('txtLatestUseMonth'),
                        row.get('nLatestUseYear') or row.get('txtLatestUseYear'),
                    )
                    for observed_date in filter(None, {earliest_date, latest_date}):
                        DateObserved.objects.get_or_create(
                            postmark=listing,
                            date=observed_date,
                            defaults={
                                'granularity': 'YEAR',
                                'created_by_id': self.user_id,
                                'modified_by_id': self.user_id,
                            },
                        )

                print(f"Listing {listing} {'created' if created else 'exists'}.")

    def import_townmark_images(self):
        filepath = os.path.join(self.import_path, 'tblTownmarkImages.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                raw_id = row.get('nRawStateDataID', '')
                postmark = self.listing_by_raw_id.get(raw_id)
                if not postmark:
                    postmark = Postmark.objects.filter(
                        code=self.normalize_value(row.get('txtPostmark'), '')
                    ).first()
                if not postmark:
                    continue

                state_row = None
                n_state_id = row.get('nStateID')
                if n_state_id and n_state_id in self.state_by_id:
                    state_row = self.state_by_id[n_state_id]
                image_dir = state_row.get('txtImageDirectory', '') if state_row else ''

                filename = self.normalize_value(row.get('txtFilename'), '')
                if not filename or filename.lower() == 'null':
                    continue

                storage_filename = f"{image_dir}/{filename}" if image_dir else filename
                checksum = hashlib.sha256(storage_filename.encode('utf-8')).hexdigest()

                image, created = PostmarkImage.objects.get_or_create(
                    postmark=postmark,
                    storage_filename=storage_filename,
                    defaults={
                        'original_filename': filename,
                        'file_checksum': checksum,
                        'mime_type': 'image/jpeg',
                        'image_width': 0,
                        'image_height': 0,
                        'file_size_bytes': 0,
                        'image_view': 'FULL',
                        'uploaded_by_id': self.user_id,
                        'created_by_id': self.user_id,
                        'modified_by_id': self.user_id,
                    },
                )
                print(f"Image {image} {'created' if created else 'exists'}.")
