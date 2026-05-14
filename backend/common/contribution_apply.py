"""
Phase 1 stub for the contribution-apply pipeline.

The pre-rewrite implementation (768 lines) was tightly coupled to the old
split Postmark / Ratemark / Auxmark / DateObserved / MarkFraming / Framing
schema. The Phase 1 model rewrite collapsed those tables into the unified
Marking model, so the prior helpers no longer have anything to apply to.

The full rewrite -- decomposing payloads into Marking + CoverMarking +
DateSeen + CoverValuation + Image rows under the new shape -- belongs to
Phase 2 (the API / contribution-flow rewrite). This module is left as an
importable surface so admin and migration codepaths load cleanly. Any
runtime call into the contribution flow raises NotImplementedError until
Phase 2 lands.
"""

from __future__ import annotations


class ContributionApplyNotImplemented(NotImplementedError):
    """Raised when the contribution flow is invoked before Phase 2 lands."""


def apply_contribution_to_catalog(contrib):
    """
    Phase 2 will reimplement this against the unified Marking model.
    Until then, contribution approval is intentionally a no-op error so
    that mistaken use is loud.
    """
    raise ContributionApplyNotImplemented(
        "apply_contribution_to_catalog is unavailable during the Phase 1 model "
        "rewrite. Re-enable in the Phase 2 API rewrite."
    )
