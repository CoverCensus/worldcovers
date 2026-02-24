"""
Backfill Postmark.rate_value from raw_import_payload using the same
first-meaningful column logic as import_ascc (txtTownmarkRateValue, txtTownmarkRateText,
txtRatesText, txtRates, txtValue). Use for existing listings that have 'Unknown' rate_value.
"""
from django.core.management.base import BaseCommand
from django.db.models import Q
from common.models import Postmark

RATE_VALUE_MAX_LENGTH = 50  # Postmark.rate_value max_length
NULLISH = {'null', 'n/a', 'na', 'none'}


def first_meaningful_rate(payload):
    """First non-empty, non-null/na value from rate-related keys; truncated to model max_length."""
    if not payload or not isinstance(payload, dict):
        return None
    for key in ('txtTownmarkRateValue', 'txtTownmarkRateText', 'txtRatesText', 'txtRates', 'txtValue'):
        value = payload.get(key)
        if value is None:
            continue
        value = str(value).strip()
        if value and value.lower() not in NULLISH:
            return value[:RATE_VALUE_MAX_LENGTH]
    return None


class Command(BaseCommand):
    help = "Backfill Postmark.rate_value from raw_import_payload (first meaningful of rate columns)"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only report how many would be updated',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        # Only consider rows that currently have Unknown/empty and have payload
        qs = Postmark.objects.filter(
            Q(rate_value__isnull=True) | Q(rate_value='') | Q(rate_value='Unknown')
        ).exclude(raw_import_payload__isnull=True)
        to_update = []
        for postmark in qs.iterator(chunk_size=1000):
            new_value = first_meaningful_rate(postmark.raw_import_payload)
            if new_value is None:
                continue
            postmark.rate_value = new_value
            to_update.append(postmark)
        if not dry_run and to_update:
            batch_size = 1000
            for i in range(0, len(to_update), batch_size):
                batch = to_update[i:i + batch_size]
                Postmark.objects.bulk_update(batch, ['rate_value'], batch_size=batch_size)
                self.stdout.write(f'  ... {min(i + batch_size, len(to_update))} / {len(to_update)} updated')
        updated = len(to_update)
        if dry_run:
            self.stdout.write(self.style.SUCCESS(f'Would update {updated} listings with rate_value from payload.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Updated {updated} listings with rate_value.'))
