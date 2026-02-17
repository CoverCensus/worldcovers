"""
Simulate loading the postmarks Listing admin changelist to surface the real error.
Run on staging (e.g. in the app container or with staging DB):

  python manage.py check_listing_admin

If the listing changelist fails in the browser, this command should raise the same
exception and print the full traceback.
"""
from django.core.management.base import BaseCommand
from django.contrib import admin


class Command(BaseCommand):
    help = (
        "Simulate the postmarks Listing admin changelist to reproduce and display "
        "any exception that prevents loading /admin/postmarks/listing/"
    )

    def handle(self, *args, **options):
        from postmarks.models import Listing

        model_admin = admin.site._registry.get(Listing)
        if model_admin is None:
            self.stdout.write(self.style.ERROR("No admin registered for postmarks.Listing"))
            return

        request = None  # Changelist may not need it for get_queryset
        self.stdout.write("Getting Listing admin and queryset...")
        try:
            qs = model_admin.get_queryset(request)
            self.stdout.write(f"  Queryset: {qs.model.__name__}, approx count (first 5): {list(qs[:5].values_list('postmark_id', flat=True))}")
        except Exception as e:
            self.stdout.write(self.style.ERROR("get_queryset failed:"))
            raise

        self.stdout.write("Getting paginator (first page)...")
        try:
            paginator = model_admin.get_paginator(request, qs, model_admin.list_per_page)
            page = paginator.get_page(1)
            self.stdout.write(f"  Page 1 has {len(page.object_list)} objects")
        except Exception as e:
            self.stdout.write(self.style.ERROR("get_paginator/get_page failed:"))
            raise

        self.stdout.write("Rendering list_display for each row on page 1...")
        for i, obj in enumerate(page.object_list):
            try:
                for field_name in model_admin.list_display:
                    if callable(getattr(model_admin, field_name, None)):
                        getattr(model_admin, field_name)(obj)
                    else:
                        getattr(obj, field_name)
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"Row {i} (postmark_id={getattr(obj, 'postmark_id', '?')}): "
                        f"field '{field_name}' failed: {e}"
                    )
                )
                raise

        self.stdout.write(self.style.SUCCESS("Changelist simulation completed with no errors."))
