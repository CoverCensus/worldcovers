// Product branding in one place. The USPCS decided on 2026-10-23 that the
// catalog presents as "APMC" with the Society seal on every screen (Trello T98).
// Internal identifiers (storage keys, package names, hostnames) are not
// branding and stay as they are.
export const APP_NAME = "APMC";
export const APP_LONG_NAME = "American Postal Markings Catalog";
export const ORG_NAME = "U.S. Philatelic Classics Society";
export const CONTACT_EMAIL = "info@worldcovers.org";

// Society links (Trello T99). The seal in the header opens the Society's site;
// the Donate controls open PayPal's documented Donate link for the Society's
// published treasurer address (uspcs.org/donations). When the Society supplies
// a hosted Donate button, replace DONATE_URL with
// "https://www.paypal.com/donate/?hosted_button_id=<id>" and nothing else changes.
export const ORG_URL = "https://www.uspcs.org/";
export const DONATE_URL =
  "https://www.paypal.com/donate/?business=treasurer%40uspcs.org&currency_code=USD&item_name=Support+the+APMC";
