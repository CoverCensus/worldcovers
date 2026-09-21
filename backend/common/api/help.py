"""Help page docs API. Serves markdown files from docs/ to the SPA Help page."""
from __future__ import annotations

import re
from pathlib import Path

from django.conf import settings
from django.utils.text import slugify

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


# Explicit allowlist of documents published on the public Help page.
#
# This endpoint is AllowAny, so anything listed here is world-readable on
# production. It is an allowlist rather than a "docs/ minus docs/devel/" sweep
# on purpose: the previous rglob published every markdown file added anywhere
# under docs/, which silently exposed two internal engineering writeups (the
# #59 load-test report and the v1 cover-image-routing defect analysis) for
# roughly six weeks. Publishing must be a deliberate act, not the default.
#
# To publish a new doc: add its stem here AND confirm it is written for
# editors rather than for us.
PUBLISHED_DOCS = frozenset({
    "getting-started",
    "faq",
    "glossary",
    "vision",
    "acknowledgements",
})


class HelpDocsView(APIView):
    """
    Serve markdown files from docs/ for the Help page.

    Only files whose stem appears in PUBLISHED_DOCS are returned; everything
    else under docs/ is treated as internal. Returns raw markdown so the SPA
    can render it as HTML.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        docs_dir = Path(settings.REPO_ROOT) / "docs"
        items = []
        if not docs_dir.exists():
            return Response({"results": items})

        for md_file in sorted(
            docs_dir.rglob("*.md"),
            key=lambda p: str(p.relative_to(docs_dir)).lower(),
        ):
            slug = slugify(md_file.stem) or md_file.stem.lower()
            if slug not in PUBLISHED_DOCS:
                continue

            try:
                markdown = md_file.read_text(encoding="utf-8")
            except OSError:
                continue

            title_match = re.search(r"^#\s+(.+)$", markdown, flags=re.MULTILINE)
            title = title_match.group(1).strip() if title_match else md_file.stem.replace("_", " ")

            items.append({
                "slug": slug,
                "title": title,
                "source_file": str(md_file.relative_to(docs_dir)),
                "markdown": markdown,
            })

        return Response({"results": items})
