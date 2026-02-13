import os
import csv
import re
import hashlib
import datetime as dt
from django.core.management.base import BaseCommand
from common.models import *  # Import all models from common.models

IMPORT_PATH = '/srv/woco/backend/imports'


class Command(BaseCommand):
    help = 'Import ASCC data into Django models'

    def handle(self, *args, **options):
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
        filepath = os.path.join(IMPORT_PATH, 'tblStates.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                self.state_by_id[row['nStateID']] = row
                admin_unit, created = AdministrativeUnit.objects.get_or_create(
                    reference_code=row['txtStateAbv'],
                    defaults={
                        'created_by_id': 1,  # Assume a system user ID
                        'modified_by_id': 1,
                    },
                )
                identity, identity_created = AdministrativeUnitIdentity.objects.get_or_create(
                    administrative_unit=admin_unit,
                    effective_from_date='2026-01-01',  # Dummy date
                    defaults={
                        'created_by_id': 1,
                        'modified_by_id': 1,
                        'unit_name': row['txtState'],
                        'unit_abbreviation': row['txtStateAbv'],
                        'unit_type': 'STATE',  # Default type
                        'hierarchy_level': 2,  # State level hierarchy
                        'change_reason': 'INITIAL',
                    },
                )
                print(f"State {admin_unit} with identity {identity} {'created' if created else 'exists'}.")

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

    def get_or_create_simple(self, model, field_name, value, cache):
        name = self.normalize_value(value)
        if name in cache:
            return cache[name]
        obj, _ = model.objects.get_or_create(**{field_name: name})
        cache[name] = obj
        return obj

    def import_raw_state_data(self):
        filepath = os.path.join(IMPORT_PATH, 'tblRawStateData.csv')
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

                rate_value = self.normalize_value(
                    row.get('txtTownmarkRateValue') or row.get('txtTownmarkRateText') or row.get('txtRatesText'),
                    'Unknown'
                )

                postmark_key = self.normalize_value(row.get('txtPostmark'), str(row.get('nRawStateDataID')))

                listing, created = Postmark.objects.get_or_create(
                    raw_state_data_id=row['nRawStateDataID'],
                    defaults={
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
                        'created_by_id': 1,
                        'modified_by_id': 1,
                        'raw_import_payload': row
                    },
                )

                if created:
                    color_name = self.normalize_value(row.get('txtTownmarkColor'), '')
                    if color_name:
                        color = self.get_or_create_simple(Color, 'color_name', color_name, self.color_cache)
                        PostmarkColor.objects.get_or_create(
                            postmark=listing,
                            color=color,
                            defaults={
                                'created_by_id': 1,
                                'modified_by_id': 1,
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
                                'created_by_id': 1,
                                'modified_by_id': 1,
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
                                    'created_by_id': 1,
                                    'modified_by_id': 1,
                                }
                            )

                print(f"Listing {listing} {'created' if created else 'exists'}.")

    def import_townmark_images(self):
        filepath = os.path.join(IMPORT_PATH, 'tblTownmarkImages.csv')
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

                filename = row['txtFilename']
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
                        'uploaded_by_id': 1,
                        'created_by_id': 1,  # Assume a system user ID
                        'modified_by_id': 1,
                    },
                )
                print(f"Image {image} {'created' if created else 'exists'}.")