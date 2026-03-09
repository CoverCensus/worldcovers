"""
Seed minimal reference data required for the catalog contribute form.

Creates one row each in PostmarkShape, LetteringStyle, FramingStyle, and DateFormat
if they are empty. Uses any existing user for created_by/modified_by; no superuser
required.

Usage:
  python manage.py seed_contribute_reference_data
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from common.models import PostmarkShape, LetteringStyle, FramingStyle, DateFormat


class Command(BaseCommand):
    help = (
        "Seed minimal reference data (shapes, lettering, framing, date format) "
        "so the catalog contribute form can create entries."
    )

    def handle(self, *args, **options):
        User = get_user_model()
        user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        if not user:
            self.stderr.write(
                self.style.ERROR(
                    "No user in database. Create at least one user (e.g. via Django admin or signup) first."
                )
            )
            return

        created = []

        if not PostmarkShape.objects.exists():
            PostmarkShape.objects.create(
                shape_name="Circle",
                shape_description="Default shape for contributions",
                created_by=user,
                modified_by=user,
            )
            created.append("PostmarkShape (Circle)")

        if not LetteringStyle.objects.exists():
            LetteringStyle.objects.create(
                lettering_style_name="Standard",
                lettering_description="Default lettering for contributions",
                created_by=user,
                modified_by=user,
            )
            created.append("LetteringStyle (Standard)")

        if not FramingStyle.objects.exists():
            FramingStyle.objects.create(
                framing_style_name="None",
                framing_description="Default framing for contributions",
                created_by=user,
                modified_by=user,
            )
            created.append("FramingStyle (None)")

        if not DateFormat.objects.exists():
            DateFormat.objects.create(
                format_name="YYYY",
                format_description="Default date format for contributions",
                created_by=user,
                modified_by=user,
            )
            created.append("DateFormat (YYYY)")

        if created:
            self.stdout.write(
                self.style.SUCCESS("Created: " + ", ".join(created))
            )
        else:
            self.stdout.write(
                "Reference data already present; no new rows created."
            )
