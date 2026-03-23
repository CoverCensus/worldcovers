import os
import csv
import re
import hashlib
import datetime as dt
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from common.models import *  # Import all models from common.models
from postmarks.models import Location

DEFAULT_IMPORT_PATH = 'imports'


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
        self.shape_cache = {}
        self.lettering_cache = {}
        self.framing_cache = {}
        self.date_format_cache = {}
        self.color_cache = {}

        self.import_states()
        self.import_raw_state_data()
        self.import_townmark_images()
        # Add import functions for other CSVs as needed

    def import_states(self):
        filepath = os.path.join(self.import_path, 'tblStates.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                self.state_by_id[row['nStateID']] = row
                reference_code = f"US-{row['txtStateAbv'].strip().upper()}"
                loc, created = Location.objects.get_or_create(
                    reference_code=reference_code,
                    defaults={
                        'created_by_id': self.user_id,
                        'modified_by_id': self.user_id,
                    },
                )
                identity, identity_created = AdministrativeUnitIdentity.objects.get_or_create(
                    administrative_unit=loc,
                    effective_from_date='1900-01-01',
                    defaults={
                        'created_by_id': self.user_id,
                        'modified_by_id': self.user_id,
                        'unit_name': row['txtState'],
                        'unit_abbreviation': row['txtStateAbv'],
                        'unit_type': 'STATE',  # Default type
                        'hierarchy_level': 2,  # State level hierarchy
                        'change_reason': 'INITIAL',
                    },
                )
                print(f"State {loc} with identity {identity} {'created' if created else 'exists'}.")

    def _state_admin_unit_for_row(self, row):
        """Return AdministrativeUnit (state) for CSV row using nStateID, or None."""
        n_state_id = row.get('nStateID')
        if not n_state_id or n_state_id not in self.state_by_id:
            return None
        state_row = self.state_by_id[n_state_id]
        reference_code = f"US-{state_row.get('txtStateAbv', '').strip().upper()}"
        if not reference_code or reference_code == 'US-':
            return None
        return Location.objects.filter(reference_code=reference_code).first()

    def normalize_value(self, value, fallback='Unknown'):
        if value is None:
            return fallback
        value = str(value).strip()
        if value == '' or value.lower() in {'null', 'n/a', 'na', 'none'}:
            return fallback
        return value

    def _first_meaningful_rate(self, row):
        """First non-empty, non-null/n/a value from rate-related columns (for rate_value)."""
        for key in ('txtTownmarkRateValue', 'txtTownmarkRateText', 'txtRatesText', 'txtRates', 'txtValue'):
            value = row.get(key)
            if value is None:
                continue
            value = str(value).strip()
            if value and value.lower() not in {'null', 'n/a', 'na', 'none'}:
                return value
        return None

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

    def get_or_create_simple(self, model, field_name, value, cache):
        name = self.normalize_value(value)
        if name in cache:
            return cache[name]
        defaults = {}
        if hasattr(model, 'created_by') or 'created_by' in [f.name for f in model._meta.fields]:
            defaults = {
                'created_by_id': self.user_id,
                'modified_by_id': self.user_id,
            }
        obj, _ = model.objects.get_or_create(**{field_name: name}, defaults=defaults)
        cache[name] = obj
        return obj

    def make_unique_postmark_key(self, base_key, raw_id):
        base_key = self.normalize_value(base_key, str(raw_id))
        candidate = base_key
        if not Postmark.objects.filter(postmark_key=candidate).exists():
            return candidate
        suffix = f"-{raw_id}"
        max_len = 100 - len(suffix)
        trimmed = base_key[:max_len] if max_len > 0 else str(raw_id)
        return f"{trimmed}{suffix}"

    def import_raw_state_data(self):
        filepath = os.path.join(self.import_path, 'tblRawStateData.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                shape = self.get_or_create_simple(
                    PostmarkShape,
                    'shape_name',
                    row.get('txtTownmarkShape'),
                    self.shape_cache,
                )
                lettering = self.get_or_create_simple(
                    LetteringStyle,
                    'lettering_style_name',
                    row.get('txtTownmarkLettering'),
                    self.lettering_cache,
                )
                framing = self.get_or_create_simple(
                    FramingStyle,
                    'framing_style_name',
                    row.get('txtTownmarkFraming'),
                    self.framing_cache,
                )
                date_format = self.get_or_create_simple(
                    DateFormat,
                    'format_name',
                    row.get('txtTownmarkDateFormat'),
                    self.date_format_cache,
                )

                rate_location_raw = self.normalize_value(row.get('txtTownmarkRateLocation'), 'NONE')
                rate_location = rate_location_raw.upper()
                valid_rate_locations = {choice[0] for choice in Postmark.RATE_LOCATION_CHOICES}
                if rate_location not in valid_rate_locations:
                    rate_location = 'NONE'

                raw_rate = self._first_meaningful_rate(row)
                rate_value = self.normalize_value(raw_rate, 'Unknown')
                if rate_value and len(rate_value) > 50:  # Postmark.rate_value max_length
                    rate_value = rate_value[:50]

                postmark_key = self.make_unique_postmark_key(
                    row.get('txtPostmark'),
                    row.get('nRawStateDataID')
                )

                defaults = {
                    'postmark_key': postmark_key,
                    'site_id': 1,
                    'postmark_shape': shape,
                    'lettering_style': lettering,
                    'framing_style': framing,
                    'date_format': date_format,
                    'rate_location': rate_location,
                    'rate_value': rate_value,
                    'is_manuscript': self.parse_bool(row.get('ynManuscript')),
                    'other_characteristics': row.get('txtOther') or '',
                    'source_page': row.get('txtPDFPage') or '',
                    'created_by_id': self.user_id,
                    'modified_by_id': self.user_id,
                    'raw_import_payload': row
                }
                state_unit = self._state_admin_unit_for_row(row)
                if state_unit:
                    defaults['state'] = state_unit

                listing, created = Postmark.objects.get_or_create(
                    raw_state_data_id=row['nRawStateDataID'],
                    defaults=defaults,
                )
                if not created and state_unit and not listing.state_id:
                    listing.state = state_unit
                    listing.save(update_fields=['state'])

                if created:
                    color_name = self.normalize_value(row.get('txtTownmarkColor'), '')
                    if color_name:
                        if len(color_name) > 50:  # Color.color_name max_length
                            color_name = color_name[:50]
                        color = self.get_or_create_simple(Color, 'color_name', color_name, self.color_cache)
                        PostmarkColor.objects.get_or_create(
                            postmark=listing,
                            color=color,
                            defaults={
                                'created_by_id': self.user_id,
                                'modified_by_id': self.user_id,
                            }
                        )

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
                    if earliest_date or latest_date:
                        PostmarkDatesSeen.objects.get_or_create(
                            postmark=listing,
                            earliest_date_seen=earliest_date or latest_date,
                            latest_date_seen=latest_date or earliest_date,
                            defaults={
                                'created_by_id': self.user_id,
                                'modified_by_id': self.user_id,
                            }
                        )

                    width = row.get('nWidth')
                    height = row.get('nHeight')
                    if width or height:
                        try:
                            width_val = float(width) if width else None
                        except ValueError:
                            width_val = None
                        try:
                            height_val = float(height) if height else None
                        except ValueError:
                            height_val = None
                        if width_val is not None or height_val is not None:
                            PostmarkSize.objects.get_or_create(
                                postmark=listing,
                                width=width_val or 0,
                                height=height_val or 0,
                                defaults={
                                    'size_notes': row.get('txtSizes') or '',
                                    'created_by_id': self.user_id,
                                    'modified_by_id': self.user_id,
                                }
                            )

                print(f"Listing {listing} {'created' if created else 'exists'}.")

    def import_townmark_images(self):
        filepath = os.path.join(self.import_path, 'tblTownmarkImages.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                listing_id = row['nRawStateDataID']
                postmark = Postmark.objects.filter(raw_state_data_id=listing_id).first()
                if not postmark:
                    continue

                state_id = None
                if postmark.raw_import_payload and 'nStateID' in postmark.raw_import_payload:
                    state_id = postmark.raw_import_payload.get('nStateID')
                image_dir = None
                if state_id and state_id in self.state_by_id:
                    image_dir = self.state_by_id[state_id].get('txtImageDirectory')

                filename = self.normalize_value(row.get('txtFilename'), '')
                if not filename or filename.lower() == 'null':
                    continue

                image_dir = self.normalize_value(image_dir, '') if image_dir else ''
                storage_filename = f"{image_dir}/{filename}" if image_dir else filename
                if not storage_filename:
                    continue

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