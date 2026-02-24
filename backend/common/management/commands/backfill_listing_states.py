"""
Backfill Postmark.state from raw_import_payload['nStateID'] using tblStates.csv.
Run after adding the state FK so existing listings show state in the admin.
Creates missing AdministrativeUnits from tblStates.csv so all states exist (e.g. on server).
Use --force to re-assign state from payload even when listing already has a state (fix wrong-all-VA).
"""
import os
import csv
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from common.models import Postmark, AdministrativeUnitIdentity
from postmarks.models import Location

DEFAULT_IMPORT_PATH = 'imports'


class Command(BaseCommand):
    help = "Backfill Postmark.state from raw_import_payload['nStateID'] using tblStates.csv"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dir', '-d',
            default=DEFAULT_IMPORT_PATH,
            help=f'Directory containing tblStates.csv (default: {DEFAULT_IMPORT_PATH})',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only report how many would be updated',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-assign state from payload for all listings with payload (fix wrong state, e.g. all Virginia)',
        )

    def _ensure_states_exist(self, states_file):
        """Create any missing AdministrativeUnits/identities from tblStates.csv; return nStateID -> AU."""
        User = get_user_model()
        user = User.objects.filter(is_superuser=True).first() or User.objects.filter(pk=1).first()
        user_id = user.pk if user else 1
        state_by_id = {}
        with open(states_file, newline='', encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                n_state_id = (row.get('nStateID') or '').strip()
                abv = (row.get('txtStateAbv') or '').strip().upper()
                name = (row.get('txtState') or '').strip()
                if not n_state_id or not abv:
                    continue
                reference_code = f'US-{abv}'
                loc, created = Location.objects.get_or_create(
                    reference_code=reference_code,
                    defaults={'created_by_id': user_id, 'modified_by_id': user_id},
                )
                AdministrativeUnitIdentity.objects.get_or_create(
                    administrative_unit=loc,
                    effective_from_date='1900-01-01',
                    defaults={
                        'created_by_id': user_id,
                        'modified_by_id': user_id,
                        'unit_name': name or abv,
                        'unit_abbreviation': abv,
                        'unit_type': 'STATE',
                        'hierarchy_level': 2,
                        'change_reason': 'INITIAL',
                    },
                )
                state_by_id[n_state_id] = loc
        return state_by_id

    def handle(self, *args, **options):
        import_path = os.path.normpath(options['dir'])
        dry_run = options['dry_run']
        force = options['force']
        states_file = os.path.join(import_path, 'tblStates.csv')
        if not os.path.isfile(states_file):
            self.stderr.write(self.style.ERROR(f'Not found: {states_file}'))
            return

        # Ensure all states exist and build nStateID -> AdministrativeUnit (strip keys for consistent lookup)
        state_by_id = self._ensure_states_exist(states_file)
        self.stdout.write(f'Loaded {len(state_by_id)} states from {states_file}')

        # Postmarks to consider: with payload; if --force, all with payload; else only state_id null
        qs = Postmark.objects.exclude(raw_import_payload__isnull=True)
        if not force:
            qs = qs.filter(state_id__isnull=True)
        to_update = []
        skipped_no_id = 0
        skipped_unknown_state = 0
        for postmark in qs.iterator(chunk_size=1000):
            payload = postmark.raw_import_payload or {}
            n_state_id = payload.get('nStateID')
            if n_state_id is None or n_state_id == '':
                skipped_no_id += 1
                continue
            n_state_id = str(n_state_id).strip()
            if not n_state_id or n_state_id not in state_by_id:
                skipped_unknown_state += 1
                continue
            new_state = state_by_id[n_state_id]
            if postmark.state_id != new_state.pk:
                postmark.state = new_state
                to_update.append(postmark)

        if not dry_run and to_update:
            batch_size = 1000
            for i in range(0, len(to_update), batch_size):
                batch = to_update[i:i + batch_size]
                Postmark.objects.bulk_update(batch, ['state'], batch_size=batch_size)
                self.stdout.write(f'  ... {min(i + batch_size, len(to_update))} / {len(to_update)} updated')
        updated = len(to_update)

        if dry_run:
            self.stdout.write(self.style.SUCCESS(
                f'Would update {updated} listings. '
                f'Skipped: {skipped_no_id} no nStateID, {skipped_unknown_state} unknown state.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Updated {updated} listings with state. '
                f'Skipped: {skipped_no_id} no nStateID, {skipped_unknown_state} unknown state.'
            ))
