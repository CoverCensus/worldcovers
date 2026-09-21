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
  /**
   * The thumbnail card heading on each detail screen (issues.md 138).
   *
   * Ian asked for this twice -- 2026-08-27 and again 2026-09-15 -- because the
   * marking and cover screens are the same two-column shell and an editor
   * three clicks deep could not tell which one they were on. The two strings
   * must never read alike; that similarity IS the defect.
   */
  associatedThumbnails: {
    marking: "Associated Marking Thumbnails",
    cover: "Associated Cover Thumbnails",
  },
} as const;
