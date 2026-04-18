from django.test import TestCase

from .models import Auxmark, Postmark, Ratemark


class MarkingModelStrTest(TestCase):
    """Guard __str__ on every marking model — ensures field-name typos surface immediately."""

    def test_ratemark_str(self):
        r = Ratemark(inscription_txt='TEST INSCRIPTION LONGER THAN FORTY CHARACTERS FOR TRUNCATION CHECK')
        result = str(r)
        self.assertIn('Ratemark', result)
        self.assertIn('TEST INSCRIPTION', result)

    def test_auxmark_str(self):
        a = Auxmark(parent_mark_type='POSTMARK', parent_mark_id=42)
        result = str(a)
        self.assertIn('Auxmark', result)
        self.assertIn('POSTMARK', result)
        self.assertIn('42', result)

    def test_postmark_str(self):
        p = Postmark(code='IA-001')
        result = str(p)
        self.assertIn('Postmark', result)
        self.assertIn('IA-001', result)
