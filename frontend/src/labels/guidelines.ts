/**
 * Canonical user-facing submission-guideline and field-help copy.
 *
 * Centralized here (DRY) so the Marking submit page (Contribute.tsx) and the
 * Cover submit/edit page (CoverEdit.tsx) render identical shared guidance from a
 * single source instead of copy-pasted JSX. Edit once; both pages stay in sync.
 *
 * Authority: Ian/Michael UI-change requests (2026-06). The philatelic wording
 * in MARKING_TYPE_GUIDELINE is a sensible default; Ian can refine it later.
 */

export interface Guideline {
  label: string;
  body: string;
}

/** Guidance shared by both the Marking and Cover submission forms. */
export const SHARED_GUIDELINES: Guideline[] = [
  {
    label: "Image Quality",
    body: "Provide clear, high-resolution scans or photographs -- 300 dpi preferred.",
  },
  {
    label: "Accuracy",
    body: "Verify all dates, locations, and details before submission.",
  },
  {
    label: "Reference works",
    body:
      "Include established reference works when available. To cite a reference " +
      "that is not in the list, describe it in a note to the editor.",
  },
];

/**
 * Marking-only: explains the difference between a Rate Mark and an Auxiliary
 * marking. Reasonable default wording; Ian can refine the phrasing later.
 */
export const MARKING_TYPE_GUIDELINE: Guideline = {
  label: "Ratemark vs. Auxmark",
  body:
    'A Ratemark states the postal rate paid or due (often a numeral, e.g. "3" ' +
    'or "5"). An Auxmark is any other instructional marking that is neither a ' +
    'Townmark nor a rate, e.g. "PAID", "FREE", "FORWARDED", or "MISSENT". As a ' +
    'rule of thumb, a marking bearing a number is a Ratemark, while one with ' +
    'only words is usually an Auxmark. If unsure, pick the closest type and add ' +
    'a note for the editor.',
};

/** Cover-only: request date verification when the date is not on the exterior. */
export const COVER_DATE_VERIFICATION_GUIDELINE: Guideline = {
  label: "Date verification",
  body:
    "If the date is not shown on the exterior of the cover, please include an " +
    "image that verifies the date (for example, the enclosed letter or docketing).",
};

/** Composed list rendered on the Marking submission form (Contribute.tsx). */
export const MARKING_SUBMISSION_GUIDELINES: Guideline[] = [
  ...SHARED_GUIDELINES,
  MARKING_TYPE_GUIDELINE,
];

/** Composed list rendered on the Cover submission form (CoverEdit.tsx). */
export const COVER_SUBMISSION_GUIDELINES: Guideline[] = [
  ...SHARED_GUIDELINES,
  COVER_DATE_VERIFICATION_GUIDELINE,
];

/**
 * Field help. Two kinds, kept distinct (Trello S33):
 *   - visible description under the control for essential INSTRUCTIONS
 *     ("enter the exact text…") -- persistent for touch and screen-reader
 *     users, never hover-only;
 *   - FieldHelp tooltip beside the label for the DEFINITION of the term, in
 *     the glossary's own words (docs/glossary.md, served at /help/glossary).
 * A tooltip never repeats visible text next to it. Keep the wording in step
 * with the glossary; constants/markingEnums.ts mirrors the date codes.
 */
export const INSCRIPTION_TEXT_HELP =
  "Enter the exact text as it appears on the marking, including abbreviations and punctuation.";

export const DATE_FORMAT_HELP =
  "Codes for how the date is arranged on the Marking -- for example MD = Month date only, YMDD = Year, month and day date.";

export const LETTERING_HELP =
  "Typeface style of the lettering on the handstamp (for example serif or sans-serif). Leave blank for Manuscript Markings.";

export const IMPRESSION_HELP =
  "Printing technique of the handstamp: Normal, Stencil, or Negative. Not used for Manuscript Markings.";

export const IRREGULAR_HELP =
  "Select when the handstamp outline is non-uniform. Not used for Manuscript Markings.";

// ── FieldHelp tooltip definitions (Trello S33) ───────────────────────────
// One export per form field; the wording mirrors docs/glossary.md.
// Marking form first, then the Cover form.
export const MARKING_TYPE_HELP =
  "Townmark: identifies the origin Post Office and bears the town name, often with a date. Ratemark: states a postal rate. Auxmark: an auxiliary or instructional Marking such as PAID, FREE, ADVERTISED, MISSENT, or FORWARDED.";

export const MANUSCRIPT_HELP =
  "Tick when the Marking was written by hand rather than struck by a handstamp. Set independently of Marking type. A Manuscript Marking has no Shape, Lettering, Impression, or Irregularity.";

export const STATE_HELP =
  "The Region (state, territory, or district) of the Post Office that produced the Marking. Submitting for a Region submits into that Region's Collection.";

export const TOWN_HELP =
  "The Post Office: a postal facility identified by its town name within a Region. Every Marking belongs to exactly one Post Office.";

export const INSCRIPTION_DEFINITION_HELP =
  "The text as it appears on the Marking itself: what was struck or written. Often includes abbreviations and roman numerals (for example RICHM'D for Richmond, or V for 5).";

export const SHAPE_HELP =
  "The base geometric form of the Marking, such as Circle, Oval, Straight Line, Box, Fancy, or Pictorial. Compound ASCC codes (DC, DLC, DLDC, and so on) are carried as listed. Not set on Manuscript Markings.";

export const COLOR_HELP =
  "Ink color of the Marking, identified by name. Leave blank when the source does not state a color.";

// Marking form only; the Cover form has COVER_DESCRIPTION_HELP below.
export const DESCRIPTION_HELP =
  "Free-text annotations about this Marking: anything the structured fields cannot hold.";

export const RATE_VALUE_HELP =
  "The numeric amount of postage stated by a Ratemark, as a decimal value in cents. A 3-cent rate is entered as 3.";

export const CATALOG_CODE_HELP =
  "The Marking's identifier in the selected Reference Work's series (for example ASCC6-VA-M0001). Suggested from the State and Reference Works; Editors may adjust it.";

export const DIMENSIONS_HELP =
  "Size of the marking impression in millimetres. A circular shape takes a single diameter; other shapes take width and height.";

export const REFERENCE_WORKS_HELP =
  "A citable publication, such as a printed catalog, monograph, or digital resource. Selecting one creates a Citation; its page number, section, or URL goes in the detail field.";

export const COVER_TYPE_HELP =
  "Physical form of the cover: FL Folded Letter, FLF Folded Letter Front, ENV Envelope, ENVF Envelope Front, FC Folded Cover (legacy), or UNK Unknown.";

export const COVER_DATE_HELP =
  "The date observed on this cover. Marking date ranges are built from Cover dates, so record only what the cover shows, or tick Date unknown.";

export const INSTITUTIONAL_HELP =
  "Tick when a museum, society, archive, or other institution holds the cover rather than a private collector.";

export const BACKSTAMP_HELP =
  "Tick when the Marking appears on the reverse of the cover.";

export const NO_COVER_IMAGE_HELP =
  "Tick when no image of this cover can be supplied. An image is otherwise required as evidence.";

// Cover form only; its description is public on the cover detail page.
export const COVER_DESCRIPTION_HELP =
  "Free-text notes about the cover, shown on the public cover detail page.";

/**
 * Copy for the wrong-kind-of-image warning (issue #76).
 *
 * Shown when an uploaded image's proportions suggest it belongs on the other
 * form -- a whole cover on the marking form, or a marking closeup on the cover
 * form. The check is a guess from pixel dimensions, so the wording stays
 * tentative ("looks like") and every message names the acknowledgement that
 * lets the contributor proceed anyway.
 */
export const MARKING_FORM_COVER_IMAGE_WARNING = {
  title: "This image may show a whole Cover",
  body:
    "This form collects a close-up of a Marking. Crop the marking out, and if the " +
    "cover is not catalogued yet, submit it with this marking using the Cover section " +
    "below; otherwise use an existing Cover record.",
} as const;

/**
 * The Cover section on the new-Marking form (Trello T37). Ian, 2026-10-19:
 * "When adding a NEW marking, give the opportunity to add the corresponding
 * cover at that time to be approved." Both Entries are reviewed separately.
 */
export const PENDING_COVER_SECTION = {
  toggle: "Also submit the Cover this marking is on",
  help:
    "Fill in the Cover here instead of waiting for the Marking to be approved. " +
    "The Marking is reviewed first; when it is approved, the Cover becomes its own " +
    "submission for the same Editors to review. The uncropped scan becomes the " +
    "Cover's image.",
  imagesLabel: "Cover Images",
  imagesHelp:
    "The original scan of each cropped upload is added here automatically. " +
    "Add or remove images as needed.",
  addImage: "Add cover image",
  warningAction: "Also submit it as the Cover",
} as const;

export const COVER_FORM_MARKING_IMAGE_WARNING = {
  title: "This looks like a marking close-up, not a cover",
  body:
    "This form collects images of the cover itself -- the front, back, or " +
    "interior. A close-up of the marking belongs on the marking record.",
} as const;

/** Reference Work fields on the Editors' Reference Works page (Trello S19). */
export const REFERENCE_WORK_CODE_HELP =
  "Short public identifier for this Reference Work, such as ASCC6 or VPHC1. Catalog codes of cited Entries are generated from it, so it cannot change once Entries cite the work.";

export const REFERENCE_WORK_TITLE_HELP =
  "The publication's title as printed. A title that already exists with the same edition is refused; edit that Reference Work instead.";

export const REFERENCE_WORK_AUTHORSHIP_HELP =
  "All authors or editors, as printed. Separate people with a semicolon; 'and' or '&' between names also separates, so a firm such as 'Harrison and Sons' reads as two authors. A comma inside one person's name is kept, so 'Briggs, Deane R.' stays whole.";

export const REFERENCE_WORK_PUBLISHER_HELP =
  "The publishing body, society, or press.";

export const REFERENCE_WORK_YEAR_HELP =
  "Four-digit year of publication for this edition.";

export const REFERENCE_WORK_EDITION_HELP =
  "Edition number or name, such as 2 or Revised. A number is shown as 2nd Ed.";

export const REFERENCE_WORK_VOLUME_HELP =
  "Volume number or name when the work has several volumes.";

export const REFERENCE_WORK_ISBN_HELP =
  "ISBN as printed, when the work has one.";

export const REFERENCE_WORK_URL_HELP =
  "Web address of a digital edition or catalogue record, starting with http or https.";
