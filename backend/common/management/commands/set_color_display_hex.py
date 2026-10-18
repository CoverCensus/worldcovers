"""Set approximate screen colors for existing Color rows (T82).

These are visual aids, not measured ink colors or Pantone matches. Names
cover the production and local Color lists checked on October 18, 2026.
Preview: ./woco set_color_display_hex --dry-run
Apply: ./woco set_color_display_hex --actor <user id>
Only blank values and the model's white placeholder are filled. Existing
custom values, names, Pantone codes, and record links are preserved.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from common.models import Color


# Display choices only: BLACK makes the other hue very dark but still visible.
# Two named hues use a blend. Reversed names share a value; word order alone
# does not establish a different shade. Source names remain unchanged.
DISPLAY_HEX = {
    "BLACK": "#202020",
    "BLACK BLUE": "#102B59",
    "BLACK BROWN": "#3F2513",
    "BLACK ORANGE RED": "#7B2D12",
    "BLACK PURPLE": "#441554",
    "BLACK RED": "#680D18",
    "BLACK VIOLET": "#3E1A64",
    "BLACKISH BROWN": "#3F2513",
    "BLUE": "#2456A6",
    "BLUE BLACK": "#102B59",
    "BLUE GRAY": "#536F91",
    "BLUE GREEN": "#167C80",
    "BLUE RED": "#843D83",
    "BRIGHT GREEN": "#25A044",
    "BRIGHT RED": "#E32636",
    "BROWN": "#795039",
    "BROWN BLACK": "#3F2513",
    "BROWN RED": "#9E3E2F",
    "BROWNISH": "#8A6850",
    "BROWNISH RED": "#995047",
    "CARMINE": "#A91B42",
    "CLARET": "#7A203D",
    "DARK BLUE": "#193A70",
    "DARK BROWN": "#493125",
    "DARK GREEN": "#245334",
    "DARK OLIVE": "#4B5129",
    "DARK PURPLE": "#48275D",
    "DARK RED": "#841F2C",
    "DARK VIOLET": "#4E2D70",
    "DEEP BLUE": "#16428A",
    "DEEP ORANGE": "#C95614",
    "DEEP RED": "#A01D32",
    "GRAY": "#757575",
    "GRAY BLACK": "#414141",
    "GRAY BLUE": "#536F91",
    "GRAY BROWN": "#7A675A",
    "GRAY GREEN": "#587C64",
    "GREEN": "#287A3D",
    "GREEN BLACK": "#123D20",
    "GREENISH": "#648B58",
    "GREENISH BLACK": "#123D20",
    "GREENISH BLUE": "#287D91",
    "GREY BLUE": "#536F91",
    "GREY GREEN": "#587C64",
    "INDIGO": "#3F3685",
    "LILAC": "#B79AC8",
    "MAGENTA": "#B72B86",
    "MAROON": "#742C3B",
    "OLIVE": "#727630",
    "OLIVE BROWN": "#75602E",
    "OLIVE GREEN": "#54752D",
    "OLIVE YELLOW": "#B0A239",
    "ORANGE": "#E57924",
    "ORANGE BROWN": "#AD622A",
    "ORANGE RED": "#D65025",
    "ORANGE YELLOW": "#EDAA35",
    "PALE GREEN": "#A7C99A",
    "PINK": "#E79BB0",
    "PURPLE": "#794294",
    "PURPLE BLACK": "#441554",
    "PURPLE BROWN": "#74505C",
    "PURPLE RED": "#A32F66",
    "PURPLISH": "#8B689E",
    "PURPLISH BLUE": "#584BA9",
    "PURPLISH BROWN": "#74505C",
    "RED": "#C62828",
    "RED BLACK": "#680D18",
    "RED BROWN": "#9E3E2F",
    "RED ORANGE": "#D65025",
    "RED PURPLE": "#A32F66",
    "RED VIOLET": "#A23585",
    "VERMILLION": "#E45536",
    "VIOLET": "#8250AB",
    "VIVID BLUE INK": "#245DE0",
    "YELLOW": "#E8C52E",
    "YELLOW BROWN": "#A07B2C",
    "YELLOW GREEN": "#8DAD32",
    "YELLOW ORANGE": "#EDAA35",
}


class Command(BaseCommand):
    help = "Fill placeholder Color hex values with approximate screen colors."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Preview without changing records.")
        parser.add_argument("--actor", type=int, help="User ID recorded as modified_by.")

    @transaction.atomic
    def handle(self, *args, **options):
        actor = None
        if not options["dry_run"]:
            actor = get_user_model().objects.filter(pk=options["actor"]).first()
            if actor is None:
                raise CommandError("Applying changes requires --actor with an existing user ID.")

        updated = 0
        for color in Color.objects.select_for_update().order_by("name"):
            name = " ".join(color.name.upper().replace("-", " ").split())
            hex_val = DISPLAY_HEX.get(name)
            if hex_val is None or (color.hex_val or "").upper() not in ("", "#FFFFFF"):
                continue
            self.stdout.write(f"{color.pk}: {ascii(color.name)} -> {hex_val}")
            if not options["dry_run"]:
                color.hex_val = hex_val
                color.modified_by = actor
                color.save(update_fields=["hex_val", "modified_by", "modified_date"])
            updated += 1

        action = "Would update" if options["dry_run"] else "Updated"
        self.stdout.write(f"{action} {updated} Color records.")
