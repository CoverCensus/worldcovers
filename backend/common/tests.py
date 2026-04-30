from django.test import TestCase

from .models import Marking, MarkingType


class MarkingModelStrTest(TestCase):
    """Guard __str__ on the unified Marking model. Field-name typos should
    surface immediately on instantiation."""

    def test_townmark_str_with_code(self):
        m = Marking(type=MarkingType.TOWNMARK, code='IA-001', inscription_txt='IOWA CITY', is_manuscript=False)
        result = str(m)
        self.assertIn('TOWNMARK', result)
        self.assertIn('IA-001', result)

    def test_ratemark_str_without_code(self):
        m = Marking(type=MarkingType.RATEMARK, inscription_txt='5', is_manuscript=False)
        result = str(m)
        self.assertIn('RATEMARK', result)

    def test_auxmark_str_without_code(self):
        m = Marking(type=MarkingType.AUXMARK, inscription_txt='PAID', is_manuscript=False)
        result = str(m)
        self.assertIn('AUXMARK', result)
