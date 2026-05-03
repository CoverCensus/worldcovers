"""
Help page docs API. Serves markdown files from docs/ to the SPA Help page.
Carved out of the deleted v1 API during the Phase 1 model rewrite; restored
here because Phase 1 also dropped the v2/help-docs/ route by mistake.
"""
from __future__ import annotations

import re
from pathlib import Path

from django.conf import settings
from django.utils.text import slugify

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HelpDocsView(APIView):
    """
    Serve markdown files from docs/ for the Help page.
    Files under docs/devel/ are excluded (internal-only convention).
    Returns raw markdown so the SPA can render it as HTML.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        docs_dir = Path(settings.REPO_ROOT) / "docs"
        items = []
        if not docs_dir.exists():
            return Response({"results": items})

        devel_dir = docs_dir / "devel"
        for md_file in sorted(
            docs_dir.rglob("*.md"),
            key=lambda p: str(p.relative_to(docs_dir)).lower(),
        ):
            try:
                if md_file.is_relative_to(devel_dir):
                    continue
            except ValueError:
                pass

            try:
                markdown = md_file.read_text(encoding="utf-8")
            except OSError:
                continue

            slug = slugify(md_file.stem) or md_file.stem.lower()
            title_match = re.search(r"^#\s+(.+)$", markdown, flags=re.MULTILINE)
            title = title_match.group(1).strip() if title_match else md_file.stem.replace("_", " ")

            items.append({
                "slug": slug,
                "title": title,
                "source_file": str(md_file.relative_to(docs_dir)),
                "markdown": markdown,
            })

        return Response({"results": items})
