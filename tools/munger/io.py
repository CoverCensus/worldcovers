"""io -- extracted from tools/apmc_data_munger.ipynb. See driver script for narrative."""
import pandas as pd


REQUIRED_COLS = ['Listing', 'Page', 'Chunk', 'Images Above', 'Type']

OPTIONAL_COLS = ['Manuscript', 'Default Shape', 'Institutional Ownership']

def process_meta_rows(meta_df):
    # TODO: parse META rows for section-heading / state-heading context,
    # column headers, and cross-reference targets. Inputs: meta_df with
    # columns Listing, Page, Chunk, Images Above, Type. Currently a no-op.
    return None
