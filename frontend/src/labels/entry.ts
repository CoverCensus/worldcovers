/**
 * Canonical user-facing labels for Entries (Markings and Covers).
 * Authority: docs/glossary.md and docs/devel/vocab.md.
 */

export const ENTRY_LABELS = {
  datesObserved: {
    earliest: "Earliest seen",
    latest: "Latest seen",
  },
  markingType: {
    TOWNMARK: "Townmark",
    RATEMARK: "Ratemark",
    AUXMARK: "Auxmark",
  },
} as const;
