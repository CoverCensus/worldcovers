"""The surname-first form a Postmaster sorts under.

Shared by the VPHC importer and the Postmaster API serializer so manual and
imported people sort together (Trello T71). The rule moved here unchanged
from import_vphc_reference.
"""


def postmaster_sort_name(name):
    """Surname-first, for ordering and for spotting the same person twice.

    Deliberately crude: the last whitespace-delimited token, minus a trailing
    suffix. "Gerrard T. Conn" -> "Conn, Gerrard T.". Getting this wrong costs
    ordering, not identity -- identity is the full name string.
    """
    parts = (name or "").strip().split()
    if len(parts) < 2:
        return (name or "").strip()
    suffixes = {"JR.", "JR", "SR.", "SR", "II", "III", "IV"}
    idx = -1
    if parts[-1].upper().rstrip(",") in suffixes and len(parts) > 2:
        idx = -2
    surname = parts[idx]
    rest = parts[:idx] + (parts[idx + 1:] if idx != -1 else [])
    return f"{surname}, {' '.join(rest)}".strip().rstrip(",")
