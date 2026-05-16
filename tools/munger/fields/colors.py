"""fields.colors -- extracted from tools/apmc_data_munger.ipynb. See driver script for narrative."""
import re


def parse_color_field(text):
    """Split a color field into individual normalized color names (UPPER)."""
    tokens = [t.strip().upper() for t in text.split(',') if t.strip()]
    return tokens
