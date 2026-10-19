"""Load-bearing rules of the VPHC extraction chain (docs/devel/VPHC-RULES.md).

The full-data gates are the tools' own --selftest modes, which need the source
workbook; these run in CI without it.
"""

import datetime
import importlib.util
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import vphc_crossexam
from vphc_extract import (EXCEL_EPOCH, classify_date, detect_column_shift, iso_date, norm_county,
                          parse_size, resolve_centuries)
from vphc_manuscript_ledger import ms_identity


def serial(year, month, day):
    return str((datetime.date(year, month, day) - EXCEL_EPOCH).days)


def test_era_window_puts_abingdon_1_in_the_1790s():
    # R1c: the cell decodes to 1997; the scan reads "Abingdon Dec 2. 179-".
    reading = classify_date(serial(1997, 12, 2))
    assert resolve_centuries([reading])
    assert iso_date(reading) == "1797-12-02"
    assert reading["century_inferred"] is True


def test_sequence_uses_as_few_1700s_readings_as_possible():
    first, second = classify_date("50"), classify_date("20")
    assert resolve_centuries([first, second])
    assert (first["year"], second["year"]) == (1750, 1820)


def test_town_window_outranks_sequence_on_a_reversed_row():
    # R1d: Abingdon #8 reads 1840..1823. Keep the window, report the run.
    first, second = classify_date("40"), classify_date("23")
    assert not resolve_centuries([first, second], window=(1790, 1866))
    assert (first["year"], second["year"]) == (1840, 1823)


def test_non_ascii_source_characters_still_parse():
    assert norm_county("APPOMATTOX\u00b7") == ("APPOMATTOX", "ok")
    assert parse_size("21\u00d74mm") == ("21", "4", "ok")
    assert parse_size("llxl5mm") == ("", "", "unparsed")


def test_column_shift_is_repaired():
    # R6c: colour in Size and a date serial in Colour.
    assert detect_column_shift({"G": "Black", "H": "22508", "I": "22600"}) == (
        "", "Black", "22508", "22600")


def test_manuscript_rate_comes_from_the_device_not_the_drawing_number():
    assert ms_identity("Abingdon", "Ms.", "") == ("TOWNMARK", "Abingdon", "")
    assert ms_identity("Abingdon", "Ms.", "Paid 5")[2] == "5"


def test_crossexam_refuses_an_environment_with_a_database_driver(monkeypatch):
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: None)
    vphc_crossexam._assert_no_database()
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: object())
    with pytest.raises(RuntimeError, match="read-only phase"):
        vphc_crossexam._assert_no_database()
