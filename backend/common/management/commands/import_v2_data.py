"""
Import WorldCovers V2 catalog data from `docs/data/*.csv`.

This is the primary import command and works on a fresh database — no prior
legacy import is required. When a `postmarks.csv` row has no existing
`Postmark` record the default `--missing-postmark-strategy=create` will create
a stub `Postmark` (DRAFT visibility, type-default values for required legacy
fields) that gets fully enriched in the same pass.

What this command does (order)
------------------------------
1. **Lookups**: Color, Shape, Lettering, Framing, placeholder Region, PostOffice
   from the * lookup CSVs.
2. **Core objects**: Cover, Ratemark (from their CSVs).
3. **Postmark rows** (for each matching `postmarks` line):
   - Updates additive v2 fields on `Postmark` (catalog/inscription text, shape,
     lettering, color, dimensions, impression, date_type/date_fmt, post_office,
     etc.) and merges the raw CSV row under `raw_import_payload["v2"]`.
   - **`PostmarkV2`**: immediately after each successful `Postmark.save`, runs
     `PostmarkV2.objects.update_or_create(postmark=postmark, ...)`.
     - Creates the extension row on first import; updates it on every re-import.
     - Copies legacy listing fields from `Postmark` (site, state, legacy shapes,
       rate fields, slug, visibility, …) **plus** the same v2 FKs/texts saved on
       `Postmark` in that loop.
     - Sets `PostmarkV2.date_format` from the v2 CSV `date_format` string via
       `DateFormat.get_or_create` (separate from legacy `Postmark.date_format`).
4. **Auxmark**, **DateObserved**, junction tables (cover↔postmark, postmark↔ratemark,
   mark framing), then **PostmarkValuation** where CSV rows are valid.

Notes / limitations (current CSV exports)
-----------------------------------------
  - `post_offices.csv`: `region_id` is blank → all offices use placeholder
    `Region("UNKNOWN")`.
  - `postmark_valuation.csv`: empty `appraisal_date` → valuations skipped
    (logged).
"""

import csv
import os
from decimal import Decimal, InvalidOperation
from datetime import date

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from common.models import (
    Color,
    Shape,
    Lettering,
    Framing,
    DateFormat,
    Region,
    PostOffice,
    Cover,
    Postmark,
    PostmarkShape,
    LetteringStyle,
    FramingStyle,
    PostmarkV2,
    Ratemark,
    Auxmark,
    CoverPostmark,
    PostmarkRatemark,
    MarkFraming,
    DateObserved,
    PostmarkValuation,
)


def _s(v):
    return (v or "").strip()


def parse_bool(value):
    if value is None:
        return None
    v = str(value).strip().lower()
    if v in {"", "null", "none", "n/a", "na"}:
        return None
    if v in {"1", "true", "t", "yes", "y"}:
        return True
    if v in {"0", "false", "f", "no", "n"}:
        return False
    # Fall back to None for unknown values.
    return None


def parse_int(value):
    v = _s(value)
    if not v:
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def parse_decimal(value):
    v = _s(value)
    if not v:
        return None
    try:
        return Decimal(v)
    except (ValueError, TypeError, InvalidOperation):
        return None


def parse_choice(value, allowed_values):
    v = _s(value)
    if not v:
        return None
    return v if v in allowed_values else None


def read_csv_dicts(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader)


class Command(BaseCommand):
    help = (
        "Import *.csv: lookups, Cover/Ratemark, update Postmark + PostmarkV2 per postmarks row, "
        "then auxmarks, relations, valuations. Requires Postmark.raw_state_data_id == v2 postmark_id."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dir",
            "-d",
            default="tools/wip/out",
            help="Directory containing csv exports (default: tools/wip/out)",
        )
        parser.add_argument(
            "--user",
            "-u",
            default=None,
            help="Username for created_by/modified_by (default: first superuser)",
        )
        parser.add_argument(
            "--missing-postmark-strategy",
            choices=["skip", "error", "create"],
            default="create",
            help=(
                "What to do when a postmarks.csv row has no existing Postmark "
                "(matched by raw_state_data_id):\n"
                "  create — create a stub Postmark using type defaults (default)\n"
                "  skip   — silently skip the row\n"
                "  error  — abort with ValueError"
            ),
        )

    def _get_user(self, username):
        User = get_user_model()
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                raise ValueError(f"User not found: {username}")
        user = User.objects.filter(is_superuser=True).first()
        if not user:
            user = User.objects.filter(pk=1).first()
        if not user:
            user = User.objects.filter(pk=2).first()
        if not user:
            raise ValueError("No user found; create a superuser or pass --user.")
        return user

    def handle(self, *args, **options):
        import_dir = os.path.normpath(options["dir"])
        if not os.path.isdir(import_dir):
            self.stderr.write(self.style.ERROR(f"Directory not found: {import_dir}"))
            return

        user = self._get_user(options.get("user"))
        missing_postmark_strategy = options["missing_postmark_strategy"]

        # -----------------------------
        # Load V2 CSVs into memory
        # -----------------------------
        def p(name):
            return os.path.join(import_dir, name)

        required_csvs = [
            "colors.csv",
            "shapes.csv",
            "letterings.csv",
            "framings.csv",
            "post_offices.csv",
            "covers.csv",
            "ratemarks.csv",
            "auxmarks.csv",
            "postmarks.csv",
            "date_observed.csv",
            "postmark_ratemark.csv",
            "cover_postmark.csv",
            "mark_framing.csv",
            "postmark_valuation.csv",
        ]
        for filename in required_csvs:
            if not os.path.isfile(p(filename)):
                self.stderr.write(self.style.ERROR(f"Missing required CSV: {filename}"))
                return

        colors_rows = read_csv_dicts(p("colors.csv"))
        shapes_rows = read_csv_dicts(p("shapes.csv"))
        letterings_rows = read_csv_dicts(p("letterings.csv"))
        framings_rows = read_csv_dicts(p("framings.csv"))
        post_offices_rows = read_csv_dicts(p("post_offices.csv"))
        covers_rows = read_csv_dicts(p("covers.csv"))
        ratemarks_rows = read_csv_dicts(p("ratemarks.csv"))
        auxmarks_rows = read_csv_dicts(p("auxmarks.csv"))
        postmarks_rows = read_csv_dicts(p("postmarks.csv"))
        date_observed_rows = read_csv_dicts(p("date_observed.csv"))
        postmark_ratemark_rows = read_csv_dicts(p("postmark_ratemark.csv"))
        cover_postmark_rows = read_csv_dicts(p("cover_postmark.csv"))
        mark_framing_rows = read_csv_dicts(p("mark_framing.csv"))
        postmark_valuation_rows = read_csv_dicts(p("postmark_valuation.csv"))

        self.stdout.write(f"Using user: {user.username} (id={user.pk})")

        # ---------------------------------------
        # Import lookup/reference entities first
        # ---------------------------------------
        color_map = {}
        created_colors = 0
        for row in colors_rows:
            color_id = parse_int(row.get("color_id"))
            color_name = _s(row.get("name"))
            if color_id is None:
                continue
            color_obj, created = Color.objects.get_or_create(
                color_name=color_name or "---",
                defaults={
                    "color_value": "#FFFFFF",
                    "created_by": user,
                    "modified_by": user,
                },
            )
            if created:
                created_colors += 1
            color_map[color_id] = color_obj

        shape_map = {}
        for row in shapes_rows:
            sid = parse_int(row.get("shape_id"))
            name = _s(row.get("name"))
            if sid is None or not name:
                continue
            # DB schema expects `Shape.code` to be non-null; shapes.csv does not provide it.
            # Derive a stable editor-style code from the name (unique because `name` is unique).
            derived_code = "".join(name.split())[:30].upper() or name[:30]
            obj, _ = Shape.objects.get_or_create(
                name=name,
                defaults={"code": derived_code, "created_by": user, "modified_by": user},
            )
            if getattr(obj, "code", None) in (None, ""):
                obj.code = derived_code
                obj.modified_by = user
                obj.save(update_fields=["code", "modified_by"])
            shape_map[sid] = obj

        lettering_map = {}
        for row in letterings_rows:
            lid = parse_int(row.get("lettering_id"))
            name = _s(row.get("name"))
            if lid is None or not name:
                continue
            obj, _ = Lettering.objects.get_or_create(
                name=name,
                defaults={"created_by": user, "modified_by": user},
            )
            lettering_map[lid] = obj

        framing_map = {}
        framing_code_by_name = {}
        for row in framings_rows:
            fid = parse_int(row.get("framing_id"))
            name = _s(row.get("name"))
            if fid is None or not name:
                continue
            code = None
            if " - " in name:
                code = name.split(" - ", 1)[0].strip() or None
            # Some exports may not contain the "CODE - Description" pattern.
            # Derive a non-null code as a fallback so DB constraints are satisfied.
            derived_code = "".join(name.split())[:30].upper()
            obj, _ = Framing.objects.get_or_create(
                name=name,
                defaults={"code": code or derived_code, "created_by": user, "modified_by": user},
            )
            if getattr(obj, "code", None) in (None, ""):
                obj.code = code or derived_code
                obj.modified_by = user
                obj.save(update_fields=["code", "modified_by"])
            framing_map[fid] = obj

        # post_offices.csv has region_id but it's blank for all rows.
        unknown_region, _ = Region.objects.get_or_create(
            name="UNKNOWN",
            abbrev="UNK",
            region_tier="OTHER",
            defaults={
                "created_by": user,
                "modified_by": user,
            },
        )

        post_office_map = {}
        for row in post_offices_rows:
            poid = parse_int(row.get("post_office_id"))
            name = _s(row.get("name"))
            if poid is None or not name:
                continue
            obj, _ = PostOffice.objects.get_or_create(
                name=name,
                region=unknown_region,
                defaults={"created_by": user, "modified_by": user},
            )
            post_office_map[poid] = obj

        self.stdout.write(
            f"Imported lookups: colors={len(color_map)}, shapes={len(shape_map)}, "
            f"letterings={len(lettering_map)}, framings={len(framing_map)}, post_offices={len(post_office_map)}"
        )

        # -------------------------
        # Import core V2 objects
        # -------------------------
        cover_map = {}
        created_covers = 0
        allowed_cover_types = {c for c, _ in Cover.COVER_TYPE_CHOICES}
        for row in covers_rows:
            cover_id = parse_int(row.get("cover_id"))
            if cover_id is None:
                continue
            code = f"VC-{cover_id}"
            cover_type = _s(row.get("cover_type"))
            cover_type = cover_type if cover_type in allowed_cover_types else None
            has_adhesive = parse_bool(row.get("has_adhesive"))
            if has_adhesive is None:
                has_adhesive = False
            width = parse_decimal(row.get("width"))
            height = parse_decimal(row.get("height"))
            is_institutional = parse_bool(row.get("is_institutional"))

            color_id = parse_int(row.get("color_id"))
            color_obj = color_map.get(color_id) if color_id is not None else None

            obj, created = Cover.objects.get_or_create(
                code=code,
                defaults={
                    "color": color_obj,
                    "type": cover_type,
                    "has_adhesive": has_adhesive,
                    "width": width,
                    "height": height,
                    "is_institutional": is_institutional,
                    "created_by": user,
                    "modified_by": user,
                },
            )
            if created:
                created_covers += 1
            # Update non-lookup fields if rerun with different data
            if not created:
                update_fields = []
                for field, new_val in {
                    "color": color_obj,
                    "type": cover_type,
                    "has_adhesive": has_adhesive,
                    "width": width,
                    "height": height,
                    "is_institutional": is_institutional,
                }.items():
                    if getattr(obj, field) != new_val:
                        setattr(obj, field, new_val)
                        update_fields.append(field)
                if update_fields:
                    obj.modified_by = user
                    obj.save(update_fields=[*update_fields, "modified_by"])
            cover_map[cover_id] = obj

        self.stdout.write(f"Covers ready: {len(cover_map)} (created {created_covers})")

        ratemark_map = {}
        ratemark_impression_allowed = {v for v, _ in Ratemark.IMPRESSION_CHOICES}
        for row in ratemarks_rows:
            ratemark_id = parse_int(row.get("ratemark_id"))
            if ratemark_id is None:
                continue

            inscription_txt = _s(row.get("inscription_text"))
            is_manuscript = parse_bool(row.get("is_manuscript"))
            if is_manuscript is None:
                is_manuscript = False

            # postmark data uses shape/lettering/impression/is_irregular only when not a manuscript.
            shape_id = parse_int(row.get("shape_id"))
            lettering_id = parse_int(row.get("lettering_id"))
            shape_obj = shape_map.get(shape_id) if (not is_manuscript and shape_id is not None) else None
            lettering_obj = (
                lettering_map.get(lettering_id) if (not is_manuscript and lettering_id is not None) else None
            )

            color_id = parse_int(row.get("color_id"))
            color_obj = color_map.get(color_id) if color_id is not None else None

            impression = _s(row.get("impression")) if not is_manuscript else None
            impression = impression if impression in ratemark_impression_allowed else None

            is_irregular = parse_bool(row.get("is_irregular"))
            is_irregular = is_irregular if not is_manuscript else None

            width = parse_decimal(row.get("width"))
            height = parse_decimal(row.get("height"))

            rate_val = parse_decimal(row.get("rate_value"))

            obj, created = Ratemark.objects.get_or_create(
                inscription_txt=inscription_txt,
                rate_val=rate_val,
                is_manuscript=is_manuscript,
                shape=shape_obj,
                lettering=lettering_obj,
                color=color_obj,
                impression=impression,
                is_irreg=is_irregular,
                width=width,
                height=height,
                defaults={"created_by": user, "modified_by": user},
            )
            ratemark_map[ratemark_id] = obj

        self.stdout.write(f"Ratemarks ready: {len(ratemark_map)}")

        # -------------------------
        # Update existing Postmarks
        # -------------------------
        postmark_ids = set(parse_int(r.get("postmark_id")) for r in postmarks_rows)
        postmark_ids.discard(None)

        postmarks = Postmark.objects.filter(raw_state_data_id__in=postmark_ids)
        postmark_by_raw_id = {p.raw_state_data_id: p for p in postmarks}

        missing_ids = postmark_ids - set(postmark_by_raw_id.keys())

        if missing_ids and missing_postmark_strategy == "create":
            # Get or create pk=1 entries for required legacy lookup FKs.
            # Nullable fields are left null.
            def _get_or_create_pk1(Model, **name_field):
                obj = Model.objects.filter(pk=1).first()
                if obj is None:
                    obj = Model.objects.get_or_create(
                        **name_field,
                        defaults={"created_by": user, "modified_by": user},
                    )[0]
                return obj

            stub_shape = _get_or_create_pk1(PostmarkShape, shape_name="Unspecified")
            stub_lettering = _get_or_create_pk1(LetteringStyle, lettering_style_name="Unspecified")
            stub_framing = _get_or_create_pk1(FramingStyle, framing_style_name="Unspecified")
            stub_date_format = _get_or_create_pk1(DateFormat, format_name="Unspecified")

            created_stubs = 0
            for mid in missing_ids:
                stub, created = Postmark.objects.get_or_create(
                    raw_state_data_id=mid,
                    defaults={
                        "postmark_key": f"V2-{mid}",
                        "postmark_shape": stub_shape,
                        "lettering_style": stub_lettering,
                        "framing_style": stub_framing,
                        "date_format": stub_date_format,
                        "rate_location": "NONE",
                        "rate_value": "",
                        "visibility": "DRAFT",
                        "source_catalog": "",
                        "created_by": user,
                        "modified_by": user,
                    },
                )
                postmark_by_raw_id[mid] = stub
                if created:
                    created_stubs += 1
            self.stdout.write(
                f"Stub Postmarks created: {created_stubs} "
                f"(already existed: {len(missing_ids) - created_stubs})"
            )

        missing_postmarks = 0
        updated_postmarks = 0

        # V2 choice validation
        postmark_date_fmt_allowed = {v for v, _ in Postmark.DATE_FMT_CHOICES}
        postmark_date_type_allowed = {v for v, _ in Postmark.DATE_TYPE_CHOICES}
        postmark_impression_allowed = {v for v, _ in Postmark.IMPRESSION_CHOICES}
        date_format_cache = {}

        for row in postmarks_rows:
            postmark_id = parse_int(row.get("postmark_id"))
            if postmark_id is None:
                continue

            postmark = postmark_by_raw_id.get(postmark_id)
            if not postmark:
                missing_postmarks += 1
                if missing_postmark_strategy == "error":
                    raise ValueError(f"Postmark not found for v2 postmark_id={postmark_id}")
                continue

            is_manuscript = parse_bool(row.get("is_manuscript"))
            if is_manuscript is None:
                # Keep existing value if CSV missing it
                is_manuscript = postmark.is_manuscript

            shape_id = parse_int(row.get("shape_id"))
            lettering_id = parse_int(row.get("lettering_id"))

            shape_obj = shape_map.get(shape_id) if (not is_manuscript and shape_id is not None) else None
            lettering_obj = (
                lettering_map.get(lettering_id) if (not is_manuscript and lettering_id is not None) else None
            )

            color_id = parse_int(row.get("color_id"))
            color_obj = color_map.get(color_id) if color_id is not None else None

            # V2 additive fields
            postmark.catalog_txt = _s(row.get("catalog_text"))
            postmark.inscription_txt = _s(row.get("inscription_text"))
            postmark.is_manuscript = bool(is_manuscript)
            postmark.shape = shape_obj
            postmark.lettering = lettering_obj
            postmark.color = color_obj

            postmark.width = parse_decimal(row.get("width"))
            postmark.height = parse_decimal(row.get("height"))

            impression = _s(row.get("impression")) if not is_manuscript else None
            impression = impression if impression in postmark_impression_allowed else None

            is_irregular = parse_bool(row.get("is_irregular")) if not is_manuscript else None

            postmark.impression = impression
            postmark.is_irreg = is_irregular

            postmark.date_type = parse_choice(row.get("date_type"), postmark_date_type_allowed)
            postmark.date_fmt = parse_choice(row.get("date_format"), postmark_date_fmt_allowed)

            post_office_id = parse_int(row.get("post_office_id"))
            postmark.post_office = post_office_map.get(post_office_id) if post_office_id is not None else None
            date_format_name = _s(row.get("date_format"))
            date_format_obj = None
            if date_format_name:
                date_format_obj = date_format_cache.get(date_format_name)
                if date_format_obj is None:
                    date_format_obj, _ = DateFormat.objects.get_or_create(
                        format_name=date_format_name,
                        defaults={
                            "format_description": "",
                            "created_by": user,
                            "modified_by": user,
                        },
                    )
                    date_format_cache[date_format_name] = date_format_obj

            # Keep v2-specific payload for debugging/audit without touching legacy payload content.
            payload = postmark.raw_import_payload or {}
            payload["v2"] = row
            postmark.raw_import_payload = payload

            postmark.modified_by = user
            postmark.save(
                update_fields=[
                    "catalog_txt",
                    "inscription_txt",
                    "is_manuscript",
                    "shape",
                    "lettering",
                    "color",
                    "width",
                    "height",
                    "impression",
                    "is_irreg",
                    "date_type",
                    "date_fmt",
                    "post_office",
                    "raw_import_payload",
                    "modified_by",
                ]
            )
            PostmarkV2.objects.update_or_create(
                postmark=postmark,
                defaults={
                    "site": postmark.site,
                    "postal_facility_identity": postmark.postal_facility_identity,
                    "state": postmark.state,
                    "postmark_shape": postmark.postmark_shape,
                    "lettering_style": postmark.lettering_style,
                    "framing_style": postmark.framing_style,
                    "legacy_date_format": postmark.date_format,
                    "postmark_key": postmark.postmark_key,
                    "raw_state_data_id": postmark.raw_state_data_id,
                    "public_slug": postmark.public_slug,
                    "visibility": postmark.visibility,
                    "contribution_approval_status": postmark.contribution_approval_status,
                    "source_catalog": postmark.source_catalog,
                    "source_page": postmark.source_page,
                    "last_public_update_at": postmark.last_public_update_at,
                    "raw_import_payload": postmark.raw_import_payload,
                    "rate_location": postmark.rate_location,
                    "rate_value": postmark.rate_value,
                    "other_characteristics": postmark.other_characteristics,
                    "code": postmark.code,
                    "catalog_txt": postmark.catalog_txt,
                    "inscription_txt": postmark.inscription_txt,
                    "post_office": postmark.post_office,
                    "shape": postmark.shape,
                    "lettering": postmark.lettering,
                    "color": postmark.color,
                    "is_manuscript": postmark.is_manuscript,
                    "impression": postmark.impression,
                    "is_irreg": postmark.is_irreg,
                    "width": postmark.width,
                    "height": postmark.height,
                    "date_type": postmark.date_type,
                    "date_fmt": postmark.date_fmt,
                    "date_format": date_format_obj,
                    "created_by": user,
                    "modified_by": user,
                },
            )
            updated_postmarks += 1

        postmark_pk_map = {rid: postmark_by_raw_id[rid].pk for rid in postmark_by_raw_id.keys()}
        if missing_postmarks > 0:
            self.stderr.write(self.style.WARNING(
                f"{missing_postmarks} postmarks.csv row(s) skipped — no matching Postmark "
                f"(raw_state_data_id not found). Re-run with --missing-postmark-strategy=create "
                f"to auto-create stubs, or =error to abort."
            ))
        self.stdout.write(f"Postmarks updated: {updated_postmarks} (skipped: {missing_postmarks})")

        # -------------------------
        # Import Auxmarks
        # -------------------------
        auxmark_impression_allowed = {v for v, _ in Auxmark.IMPRESSION_CHOICES}
        auxmark_map = {}
        for row in auxmarks_rows:
            auxmark_id = parse_int(row.get("auxmark_id"))
            if auxmark_id is None:
                continue

            parent_mark_type = _s(row.get("parent_mark_type"))
            parent_mark_id_external = parse_int(row.get("parent_mark_id"))
            if not parent_mark_type or parent_mark_id_external is None:
                continue

            if parent_mark_type == "POSTMARK":
                parent_pk = postmark_pk_map.get(parent_mark_id_external)
            elif parent_mark_type == "RATEMARK":
                parent_pk = ratemark_map.get(parent_mark_id_external).pk if ratemark_map.get(parent_mark_id_external) else None
            else:
                parent_pk = None

            if parent_pk is None:
                # Parent not imported/updated; skip.
                continue

            is_manuscript = parse_bool(row.get("is_manuscript"))
            if is_manuscript is None:
                is_manuscript = False

            shape_id = parse_int(row.get("shape_id"))
            lettering_id = parse_int(row.get("lettering_id"))
            shape_obj = shape_map.get(shape_id) if (not is_manuscript and shape_id is not None) else None
            lettering_obj = (
                lettering_map.get(lettering_id) if (not is_manuscript and lettering_id is not None) else None
            )

            color_id = parse_int(row.get("color_id"))
            color_obj = color_map.get(color_id) if color_id is not None else None

            impression = _s(row.get("impression")) if not is_manuscript else None
            impression = impression if impression in auxmark_impression_allowed else None

            is_irregular = parse_bool(row.get("is_irregular")) if not is_manuscript else None

            width = parse_decimal(row.get("width"))
            height = parse_decimal(row.get("height"))

            inscription_text = _s(row.get("inscription_text"))

            obj, _ = Auxmark.objects.get_or_create(
                parent_mark_type=parent_mark_type,
                parent_mark_id=parent_pk,
                inscription_text=inscription_text,
                is_manuscript=is_manuscript,
                shape=shape_obj,
                lettering=lettering_obj,
                color=color_obj,
                impression=impression,
                is_irreg=is_irregular,
                width=width,
                height=height,
                defaults={"created_by": user, "modified_by": user},
            )

            auxmark_map[auxmark_id] = obj

        self.stdout.write(f"Auxmarks ready: {len(auxmark_map)}")

        # -------------------------
        # DateObserved
        # -------------------------
        created_dates_observed = 0
        for row in date_observed_rows:
            postmark_id = parse_int(row.get("postmark_id"))
            if postmark_id is None:
                continue
            postmark = postmark_by_raw_id.get(postmark_id)
            if not postmark:
                continue

            d_str = _s(row.get("date"))
            if not d_str:
                continue
            try:
                d = date.fromisoformat(d_str)
            except ValueError:
                continue

            granularity = _s(row.get("granularity"))
            if granularity not in {v for v, _ in DateObserved.GRANULARITY_CHOICES}:
                continue

            obj, created = DateObserved.objects.get_or_create(
                postmark=postmark,
                date=d,
                granularity=granularity,
                defaults={"created_by": user, "modified_by": user},
            )
            if created:
                created_dates_observed += 1

        self.stdout.write(f"DateObserved created: {created_dates_observed}")

        # -------------------------
        # PostmarkRatemark join
        # -------------------------
        for row in postmark_ratemark_rows:
            postmark_id = parse_int(row.get("postmark_id"))
            ratemark_id = parse_int(row.get("ratemark_id"))
            if postmark_id is None or ratemark_id is None:
                continue
            postmark = postmark_by_raw_id.get(postmark_id)
            ratemark = ratemark_map.get(ratemark_id)
            if not postmark or not ratemark:
                continue
            placement_type = _s(row.get("placement_type"))
            allowed = {v for v, _ in PostmarkRatemark.PLACEMENT_TYPE_CHOICES}
            placement_type = placement_type if placement_type in allowed else None
            PostmarkRatemark.objects.get_or_create(
                postmark=postmark,
                ratemark=ratemark,
                defaults={
                    "placement_type": placement_type,
                    "created_by": user,
                    "modified_by": user,
                },
            )

        # -------------------------
        # CoverPostmark join
        # -------------------------
        for row in cover_postmark_rows:
            cover_id = parse_int(row.get("cover_id"))
            postmark_id = parse_int(row.get("postmark_id"))
            if cover_id is None or postmark_id is None:
                continue
            cover = cover_map.get(cover_id)
            postmark = postmark_by_raw_id.get(postmark_id)
            if not cover or not postmark:
                continue
            is_backstamp = parse_bool(row.get("is_backstamp")) or False
            CoverPostmark.objects.get_or_create(
                cover=cover,
                postmark=postmark,
                defaults={
                    "is_backstamp": is_backstamp,
                    "created_by": user,
                    "modified_by": user,
                },
            )

        # -------------------------
        # MarkFraming join
        # -------------------------
        created_mark_framing = 0
        allowed_parent_types = {v for v, _ in MarkFraming.PARENT_MARK_TYPE_CHOICES}
        for row in mark_framing_rows:
            parent_mark_type = _s(row.get("parent_mark_type"))
            if parent_mark_type not in allowed_parent_types:
                continue

            parent_mark_id_external = parse_int(row.get("parent_mark_id"))
            framing_id = parse_int(row.get("framing_id"))
            framing_pos = parse_int(row.get("framing_position"))
            if parent_mark_id_external is None or framing_id is None:
                continue

            if parent_mark_type == "POSTMARK":
                parent_pk = postmark_pk_map.get(parent_mark_id_external)
            elif parent_mark_type == "RATEMARK":
                ratemark_obj = ratemark_map.get(parent_mark_id_external)
                parent_pk = ratemark_obj.pk if ratemark_obj else None
            else:  # AUXMARK
                auxmark_obj = auxmark_map.get(parent_mark_id_external)
                parent_pk = auxmark_obj.pk if auxmark_obj else None

            framing_obj = framing_map.get(framing_id)
            if parent_pk is None or not framing_obj:
                continue

            obj, created = MarkFraming.objects.get_or_create(
                parent_mark_type=parent_mark_type,
                parent_mark_id=parent_pk,
                framing=framing_obj,
                defaults={
                    "framing_pos": framing_pos,
                    "created_by": user,
                    "modified_by": user,
                },
            )
            if created:
                created_mark_framing += 1

        self.stdout.write(f"MarkFraming created: {created_mark_framing}")

        # -------------------------
        # PostmarkValuation (skip)
        # -------------------------
        has_any_valuation_date = any(_s(r.get("appraisal_date")) for r in postmark_valuation_rows)
        if not has_any_valuation_date:
            self.stdout.write("Skipping PostmarkValuation import: `appraisal_date` is empty in postmark_valuation.csv.")
        else:
            # Best-effort: parse what we can.
            valuation_created = 0
            allowed_month = {v for v, _ in PostmarkValuation.PLACEMENT_TYPE_CHOICES} if hasattr(PostmarkValuation, "PLACEMENT_TYPE_CHOICES") else None
            for row in postmark_valuation_rows:
                postmark_id = parse_int(row.get("postmark_id"))
                if postmark_id is None:
                    continue
                postmark = postmark_by_raw_id.get(postmark_id)
                if not postmark:
                    continue
                d_str = _s(row.get("appraisal_date"))
                if not d_str:
                    continue
                try:
                    d = date.fromisoformat(d_str)
                except ValueError:
                    continue
                amount = parse_decimal(row.get("amount"))
                if amount is None:
                    continue
                PostmarkValuation.objects.get_or_create(
                    postmark=postmark,
                    estimated_value=amount,
                    valuation_date=d,
                    defaults={
                        "valued_by_user": user,
                        "created_by": user,
                        "modified_by": user,
                    },
                )
                valuation_created += 1
            self.stdout.write(f"PostmarkValuation created (best-effort): {valuation_created}")

        self.stdout.write(self.style.SUCCESS("V2 import complete."))

