"""Source-backed regressions from the Massachusetts bundle review."""
import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_v1_pipeline import (
    Image, ascc_data_munger, read_csv, v1_attach_images, v1_bundle_overlay, v1_catalog_rows,
    write_csv, write_munger_seeds,
)
from munger.fields.dates import parse_date_field
from munger.fields.rates import parse_rate_token
from munger.fields.sizes import parse_size_field
from munger.head import split_head_annotation_notes
from munger.rate_assembly import parse_rate_amount
from munger.relationships import resolve_same_inscription
from v1_massachusetts import sanitize_boston_inscription
from v1_to_v2_catalog_format import IMAGE_REF_WRITE_COLUMNS


class MassachusettsParsers(unittest.TestCase):
    def test_date_forms_keep_supported_precision(self):
        self.assertEqual(parse_date_field('1853-5')['date_year_end'], 1855)
        parsed = parse_date_field('Dec., 1785')
        self.assertEqual((parsed['date_month'], parsed['date_granularity']), (12, 'MONTH'))
        parsed = parse_date_field('[Nov.20,]1784')
        self.assertEqual((parsed['date_year_start'], parsed['date_granularity']), (1784, 'YEAR'))

    def test_latest_rate_fraction_and_qualifier(self):
        parsed = parse_rate_token('(L) has 18 3/4 [ms.]')
        self.assertEqual(parse_rate_amount(parsed['rate_amount_raw'])[0], 18.75)
        self.assertEqual(parsed['rate_inscription_raw'], '18 3/4 [ms.]')
        self.assertTrue(parsed['rate_is_manuscript'])
        self.assertEqual(parsed['rate_raw'], '(L) has 18 3/4 [ms.]')

    def test_shape_names(self):
        for text, shape, width in [('oval-34', 'O', 34), ('half circle-32', 'ARC', 32),
                                   ('semi-circle-25x15', 'ARC', 25)]:
            parsed = parse_size_field(text)
            self.assertEqual((parsed['size_shape_code'], parsed['size_dim1']), (shape, width))

    def test_name_notation_and_same_suffix(self):
        for text in ['Bo', 'Bos']:
            self.assertEqual(sanitize_boston_inscription(text), text)
        for text in ['N(ew) E(ngland) Village', 'Boxboro(ugh)']:
            self.assertEqual(split_head_annotation_notes(text, include_attached_note=True), (text, []))
        self.assertEqual(resolve_same_inscription('WALTHAM,MASS.5cts', 'Waltham', ',MASS.'),
                         'WALTHAM,MASS.')


class MassachusettsBundle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temp.cleanup)
        root = Path(cls.temp.name)
        seed = write_munger_seeds(root)
        references = read_csv(seed / 'reference_works.csv')
        references.append({**references[0], 'id': '2', 'code': 'BPM2', 'title': 'Boston Postal Markings'})
        write_csv(seed / 'reference_works.csv', list(references[0]), references)
        # Use the test seed's region; the catalog interpretation is independent
        # of the region's code. Boston normalization is requested in the adapter.
        rows = []
        def source(raw_id, text, town, inscription='', dates='', colors=''):
            rows.append(dict(nRawStateDataID=str(raw_id), txtRawStateData=text,
                             txtTown=town, txtTownPostmark=inscription, txtPostmark=inscription,
                             txtDatesSeen=dates, txtColors=colors, txtTownmarkColor='',
                             txtTownmarkShape='', txtRatesText=''))
        source(17425, 'BOSTON(E)(Feb. 19, 1769;Ms;Violet) 50', 'Boston', 'BOSTON', 'Feb. 19, 1769')
        source(17426, '(L)(July 24, 1769) 50', 'Boston', '', 'July 24, 1769')
        source(17427, '(E)(Sept. 9, 1769;Ms;Magenta,Red) 50', 'Boston', 'BOSTON', 'Sept. 9, 1769')
        source(17428, '(L)(Jan. 13, 1775;Magenta) 50', 'Boston', '', 'Jan. 13, 1775')
        source(17678, '(597) 2(1851;Red;1853-57;Black) 60', 'Boston', '2', '1851,1853-57', 'Red,Black')
        source(17694, 'FREE(1794-1801;Black;1803-04;Black) 15', 'Boston', 'FREE')
        source(17702, "(493) 3 O'CLOCK/DELIVERY(1854-56;oval-34;Red) 15", 'Boston', "3 O'CLOCK/DELIVERY")
        source(17701, 'P.O.BUSINESS/FREE(--;half circle-32;Black) 50', 'Boston', 'P.O.BUSINESS/FREE')
        source(17693, '18 CENTS(1852;16x18;PAID;Red) 125', 'Boston', '18 CENTS')
        source(19258, '(597) 2(1851;Red;1853-57;Black) 60', 'Boston', '2', '1851', 'Black')
        rows[-1]['txtRatesText'] = '1853-57'
        source(1, 'NEWBURY(E)(1850;30;Black) 20', 'Newbury', 'NEWBURY', '1850')
        source(2, '(L)(1851) 20', 'Newbury', '', '1851')
        source(3, 'MARBLEHEAD(1850;20;Red) 20', 'Marblehead', 'MARBLEHEAD', '1850')
        source(4, 'NEWBURY(E)(1850;30;Black) 20', 'Newbury', 'NEWBURY', '1850')
        source(5, '(L)(1852) 20', 'Newbury', '', '1852')
        source(18988, '(No town marking)(1847;2;Red) Drop rate 50', 'Worcester', '(No town marking)', '1847')
        source(18812, '(No town mark)(c1850;PAID,1;Blue) 75', 'Ware', '(No town mark)', 'c1850')
        source(40130, 'N(ew) E(ngland) Village(1850;Ms;Black) 20', 'New England Village', 'N(ew) E(ngland) Village')
        source(18146, 'KENNEBUNK/MS.(See Maine)--', 'Kennebunk', 'KENNEBUNK/MS.')
        source(40111, 'Mirickville c1849 20', 'Mirickville', 'Mirickville', '1849')
        rows[-1]['txtPostmark'] = 'Mirickville c'
        source(40118, 'Monument 1831 -50 25', 'Monument', 'Monument', '1831')
        source(17955, 'ENFIELD(1828;30;Black) 20', 'Enfield', 'ENFIELD', 'MAS.1828')
        source(17477, 'BOSTON(Dec., 1785;Ms;Black) 20', 'Boston', 'BOSTON', 'Dec., 1785')
        source(17451, 'BOSTON([Nov.20,]1784;Ms;Black) 20', 'Boston', 'BOSTON', '[Nov.20,]1784')
        source(185865, 'HAVERHILL(1830;Ms;(L) has 18 3/4 [ms.];Black) 20', 'Haverhill', 'HAVERHILL')
        slice_path = root / 'slice.csv'
        catalog_path = root / 'catalog.csv'
        out = root / 'out'
        write_csv(slice_path, list(rows[0]), rows)
        refs = []
        for raw_id in (17428, 4, 18988, 17702):
            filename = f'{raw_id}.png'
            Image.new('RGB', (4, 4), 'white').save(root / filename)
            refs.append(dict(source_row_id=str(raw_id), townmark_image_id=str(raw_id),
                             source_filename=filename, storage_filename='ma/' + filename,
                             display_order='1', image_view='FULL', image_description='',
                             is_tracing='True', subject_type='COVER' if raw_id == 4 else 'MARKING'))
        write_csv(root / 'refs.csv', IMAGE_REF_WRITE_COLUMNS, refs)
        with contextlib.redirect_stdout(io.StringIO()):
            v1_catalog_rows.write_v1_catalog_rows(slice_path, catalog_path, state='MA')
            ascc_data_munger.main(['--input', str(catalog_path), '--input-dir', str(seed),
                                  '--out-dir', str(out), '--region-abbrev', 'WV',
                                  '--reference-work-code', 'ASCC6'])
            v1_attach_images.main(['--state', 'MA', '--image-refs', str(root / 'refs.csv'),
                                   '--bundle-dir', str(out), '--v1-image-root', str(root),
                                   '--media-dir', str(root / 'media'), '--warnings', str(out / 'warnings.csv')])
            v1_bundle_overlay.main(['--state', 'MA', '--slice', str(slice_path),
                                    '--image-refs', str(root / 'refs.csv'), '--bundle-dir', str(out),
                                    '--v1-image-root', str(root), '--media-dir', str(root / 'media'),
                                    '--warnings', str(out / 'warnings.csv'), '--preserve-images'])
        cls.markings = {r['code']: r for r in read_csv(out / 'markings.csv')}
        cls.source = read_csv(out / 'source_marking_map.csv')
        cls.dates = read_csv(out / 'dates_seen.csv')
        cls.offices = {r['code']: r['name'] for r in read_csv(out / 'post_offices.csv')}
        cls.images = read_csv(out / 'images.csv')
        cls.links = read_csv(out / 'cover_markings.csv')
        cls.warnings = read_csv(out / 'warnings.csv')

    def rows(self, raw_id):
        codes = {r['marking_code'] for r in self.source if r['chunk'] == str(raw_id)}
        return [self.markings[code] for code in sorted(codes)]

    def observed(self, marking):
        return {r['date'] for r in self.dates if r['subject_id'] == marking['code']}

    def test_latest_dates_target_preceding_device_and_color(self):
        violet = self.rows(17425)[0]
        self.assertEqual(self.observed(violet), {'1769-02-19', '1769-07-24'})
        colors = {r['color']: self.observed(r) for r in self.rows(17427)}
        self.assertEqual(colors, {'MAGENTA': {'1769-09-09', '1775-01-13'}, 'RED': {'1769-09-09'}})
        self.assertEqual(self.rows(17428)[0]['color'], 'MAGENTA')

    def test_date_color_pairs_and_standalone_types(self):
        rates = self.rows(17678)
        self.assertEqual({r['type'] for r in rates}, {'RATEMARK'})
        self.assertEqual({r['color']: self.observed(r) for r in rates},
                         {'RED': {'1851-01-01'}, 'BLACK': {'1853-01-01', '1857-01-01'}})
        free = self.rows(17694)
        self.assertEqual(len(free), 1)
        self.assertEqual(free[0]['type'], 'AUXMARK')
        delivery = self.rows(17702)[0]
        self.assertEqual((delivery['type'], delivery['shape']), ('AUXMARK', 'O - Oval'))
        self.assertEqual(self.offices[delivery['post_office']], 'BOSTON')
        self.assertFalse({'FREE', 'PAID', 'P.O.BUSINESS'} & set(self.offices.values()))
        business = self.rows(17701)
        self.assertEqual(len(business), 1)
        self.assertEqual((business[0]['type'], business[0]['shape']), ('AUXMARK', 'ARC - Arc or Semi-circle'))
        cents = next(r for r in self.rows(17693) if r['type'] == 'RATEMARK')
        self.assertEqual((cents['inscription_txt'], float(cents['rate_val'])), ('18 CENTS', 18))
        self.assertEqual({float(r['rate_val']) for r in self.rows(19258)}, {2})
        self.assertIn('legacy_rate_conflict', {r['issue'] for r in self.warnings})

    def test_duplicate_parent_retains_context_and_source_aliases(self):
        first, duplicate = self.rows(1)[0], self.rows(4)[0]
        self.assertEqual(first['code'], duplicate['code'])
        self.assertEqual(self.observed(first), {'1850-01-01', '1851-01-01', '1852-01-01'})
        self.assertEqual(self.rows(5)[0]['code'], first['code'])
        self.assertEqual(self.observed(self.rows(3)[0]), {'1850-01-01'})

    def test_no_town_placeholder_and_reference_are_not_markings(self):
        rows = self.rows(18988)
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]['type'], float(rows[0]['rate_val'])), ('RATEMARK', 2))
        self.assertEqual(self.offices[rows[0]['post_office']], 'WORCESTER')
        self.assertEqual(self.rows(18146), [])
        for row in self.rows(18812):
            self.assertNotEqual(row['type'], 'TOWNMARK')
            self.assertIn('c1850', row['desc'])
            self.assertEqual(self.observed(row), set())

    def test_source_precision_not_destroyed_by_legacy_fields(self):
        self.assertEqual(self.observed(self.rows(40111)[0]), set())
        self.assertEqual(self.rows(40111)[0]['inscription_txt'], 'Mirickville')
        self.assertEqual(self.observed(self.rows(40118)[0]), {'1831-01-01', '1850-01-01'})
        self.assertEqual(self.observed(self.rows(17955)[0]), {'1828-01-01'})
        month = self.rows(17477)[0]
        self.assertEqual(self.observed(month), {'1785-12-01'})
        self.assertEqual(self.observed(self.rows(17451)[0]), {'1784-01-01'})
        name = self.rows(40130)[0]
        self.assertEqual(name['inscription_txt'], 'N(ew) E(ngland) Village')
        self.assertEqual(name['impression'], '')
        rate = next(r for r in self.rows(185865) if r['type'] == 'RATEMARK')
        self.assertEqual(float(rate['rate_val']), 18.75)
        self.assertEqual(rate['inscription_txt'], '18 3/4')

    def test_images_and_cover_links_survive_source_aliases(self):
        self.assertEqual(len(self.images), 4)
        subjects = {Path(r['storage_filename']).stem: r['subject_id'] for r in self.images}
        self.assertEqual(subjects['17428'], self.rows(17428)[0]['code'])
        self.assertEqual(subjects['18988'], self.rows(18988)[0]['code'])
        self.assertEqual(subjects['17702'], self.rows(17702)[0]['code'])
        self.assertEqual(self.links[0]['cover'], subjects['4'])
        self.assertEqual(self.links[0]['marking'], self.rows(1)[0]['code'])
