import os
import csv
from django.core.management.base import BaseCommand
from common.models import *  # Import all models from common.models

IMPORT_PATH = '/srv/woco/backend/imports'


class Command(BaseCommand):
    help = 'Import ASCC data into Django models'

    def handle(self, *args, **options):
        self.import_states()
        self.import_raw_state_data()
        self.import_townmark_images()
        # Add import functions for other CSVs as needed

    def import_states(self):
        filepath = os.path.join(IMPORT_PATH, 'tblStates.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                state, created = AdministrativeUnit.objects.get_or_create(
                    reference_code=row['txtStateAbv'],
                    defaults={
                        'created_by_id': 1,  # Assume a system user ID
                        'modified_by_id': 1,
                        'unit_abbreviation': row['txtStateAbv'],
                        'unit_name': row['txtState'],
                    },
                )
                print(f"State {state} {'created' if created else 'exists'}.")

    def import_raw_state_data(self):
        filepath = os.path.join(IMPORT_PATH, 'tblRawStateData.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                listing, created = Postmark.objects.get_or_create(
                    raw_state_data_id=row['nRawStateDataID'],
                    defaults={
                        'postmark_key': row['txtPostmark'],
                        'created_by_id': 1,
                        'modified_by_id': 1,
                        'raw_import_payload': row
                    },
                )
                print(f"Listing {listing} {'created' if created else 'exists'}.")

    def import_townmark_images(self):
        filepath = os.path.join(IMPORT_PATH, 'tblTownmarkImages.csv')
        with open(filepath, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                listing_id = row['nRawStateDataID']
                postmark = Postmark.objects.filter(raw_state_data_id=listing_id).first()
                if postmark:
                    image, created = PostmarkImage.objects.get_or_create(
                        postmark=postmark,
                        storage_filename=row['txtFilename'],
                        defaults={
                            'original_filename': row['txtFilename'],
                            'uploaded_by_id': 1,
                            'created_by_id': 1,  # Assume a system user ID
                            'modified_by_id': 1,
                        },
                    )
                    print(f"Image {image} {'created' if created else 'exists'}.")