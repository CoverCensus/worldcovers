"""The public Help endpoint must publish only allowlisted docs.

Regression cover for the 2026-09-15 disclosure: HelpDocsView used to rglob every
markdown file under docs/ and exclude only docs/devel/, so two internal
engineering writeups (the #59 load-test report and the v1 cover-image-routing
defect analysis) were world-readable on production. The endpoint is AllowAny,
so "what it returns" is "what anyone on the internet can read".
"""
from pathlib import Path

from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from common.api.help import PUBLISHED_DOCS

URL = "/api/v2/help-docs/"


class HelpDocsAllowlistTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.docs_dir = Path(settings.REPO_ROOT) / "docs"
        self._scratch = []

    def tearDown(self):
        for path in self._scratch:
            path.unlink(missing_ok=True)

    def _write_scratch(self, relative_name, body="# Scratch\n\nnot for publication\n"):
        path = self.docs_dir / relative_name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        self._scratch.append(path)
        return path

    def _slugs(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        return {item["slug"] for item in response.data["results"]}

    def test_publishes_only_allowlisted_docs(self):
        # Every slug returned must be on the allowlist. This is the assertion
        # that would have failed before the fix.
        self.assertTrue(self._slugs().issubset(PUBLISHED_DOCS))

    def test_getting_started_is_published_with_content(self):
        # The guide is the one doc editors are actually sent to; an allowlist
        # that accidentally excluded it would be a silent regression.
        response = self.client.get(URL)
        guide = [i for i in response.data["results"] if i["slug"] == "getting-started"]
        self.assertEqual(len(guide), 1)
        self.assertGreater(len(guide[0]["markdown"]), 0)

    def test_new_doc_dropped_in_docs_is_not_published(self):
        # The actual failure mode: someone adds a markdown file to docs/ and it
        # goes public without anyone deciding that it should.
        self._write_scratch("zzz-internal-scratch.md")
        self.assertNotIn("zzz-internal-scratch", self._slugs())

    def test_devel_docs_stay_unpublished(self):
        self._write_scratch("devel/zzz-internal-scratch.md")
        self.assertNotIn("zzz-internal-scratch", self._slugs())

    def test_previously_leaked_reports_are_not_published(self):
        # Named explicitly so that re-adding either file to docs/ fails loudly
        # rather than quietly republishing it.
        slugs = self._slugs()
        self.assertNotIn("load-test-report", slugs)
        self.assertNotIn("v1-cover-image-routing", slugs)

    def test_endpoint_is_public(self):
        # Documenting intent: this is deliberately unauthenticated, which is
        # exactly why the allowlist carries the weight it does.
        self.assertEqual(self.client.get(URL).status_code, 200)
