"""text_utils -- extracted from tools/apmc_data_munger.ipynb. See driver script for narrative."""
import re


def strip_dot_leaders(text):
    """Remove runs of 2+ dots (dot leaders) and collapse resulting whitespace."""
    t = re.sub(r'\.{2,}', ' ', str(text))
    return re.sub(r'  +', ' ', t).strip()
