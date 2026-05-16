"""Output-equivalence test for apmc_data_munger.

Runs tools/apmc_data_munger.py on each fixture state input, then compares
every emitted CSV against the captured baseline (frozen from the notebook
output). Audit timestamp is pinned via APMC_AUDIT_TS so the created_date
and modified_date columns match byte-for-byte.

Run from the repo root or from tools/:
    python -m pytest tools/munger/tests/test_equivalence.py -x
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pandas.testing as pdt
import pytest

REPO_TOOLS = Path(__file__).resolve().parents[2]
SCRIPT = REPO_TOOLS / "apmc_data_munger.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
INPUT_DIR = REPO_TOOLS / "wip" / "in"

AUDIT_TS = "2026-01-01T00:00:00+00:00"

CSV_STEMS = [
    "colors", "letterings", "shapes",
    "post_offices", "post_office_regions",
    "markings", "dates_seen", "citations",
    "regions", "reference_works", "images",
]


def _states():
    if not FIXTURES.exists():
        return []
    return sorted(p.name for p in FIXTURES.iterdir() if (p / "baseline").is_dir())


@pytest.fixture(scope="module")
def fresh_outputs(tmp_path_factory):
    """Run the munger once per state into a tmp dir, return {state: path}."""
    out = {}
    for state in _states():
        input_csv = INPUT_DIR / f"{state}_ASCC_CTLG.csv"
        if not input_csv.exists():
            pytest.skip(f"input CSV missing for {state}: {input_csv}")
        out_dir = tmp_path_factory.mktemp(f"munger_out_{state}")
        env = dict(os.environ)
        env["APMC_AUDIT_TS"] = AUDIT_TS
        proc = subprocess.run(
            [sys.executable, str(SCRIPT),
             "--input", str(input_csv),
             "--input-dir", str(INPUT_DIR) + "/",
             "--out-dir", str(out_dir) + "/"],
            cwd=str(REPO_TOOLS),
            env=env,
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            print("STDOUT:\n" + proc.stdout)
            print("STDERR:\n" + proc.stderr)
            pytest.fail(f"munger script failed for {state} (exit {proc.returncode})")
        out[state] = out_dir
    return out


@pytest.mark.parametrize("state", _states())
@pytest.mark.parametrize("stem", CSV_STEMS)
def test_csv_equivalent(fresh_outputs, state, stem):
    baseline = FIXTURES / state / "baseline" / f"{stem}.csv"
    actual = fresh_outputs[state] / f"{stem}.csv"
    assert baseline.exists(), f"baseline missing: {baseline}"
    assert actual.exists(), f"munger did not emit: {actual}"

    df_base = pd.read_csv(baseline)
    df_actual = pd.read_csv(actual)

    # Drop wall-clock audit timestamps. The baseline was captured from the
    # notebook (live timestamp); the script run uses APMC_AUDIT_TS. Only the
    # timestamp columns differ -- audit user ids are deterministic.
    for col in ("created_date", "modified_date"):
        if col in df_base.columns:
            df_base = df_base.drop(columns=[col])
        if col in df_actual.columns:
            df_actual = df_actual.drop(columns=[col])

    sort_key = "id" if "id" in df_base.columns else list(df_base.columns)
    df_base = df_base.sort_values(sort_key).reset_index(drop=True)
    df_actual = df_actual.sort_values(sort_key).reset_index(drop=True)

    try:
        pdt.assert_frame_equal(
            df_actual, df_base, check_dtype=False, check_like=False,
        )
    except AssertionError as e:
        diff_rows = []
        if df_actual.shape == df_base.shape:
            for col in df_base.columns:
                ne = df_actual[col].astype(str) != df_base[col].astype(str)
                if ne.any():
                    idx = ne[ne].index[:10].tolist()
                    diff_rows.append((col, idx))
        msg = [f"{stem}.csv mismatch for state {state}",
               f"  baseline shape: {df_base.shape}",
               f"  actual shape:   {df_actual.shape}"]
        for col, idx in diff_rows[:8]:
            msg.append(f"  column {col!r} differs at rows {idx}")
            for i in idx[:3]:
                msg.append(f"    row {i}: base={df_base.at[i, col]!r}  "
                           f"actual={df_actual.at[i, col]!r}")
        msg.append(str(e).splitlines()[0])
        pytest.fail("\n".join(msg))
