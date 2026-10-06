import copy
from contextlib import redirect_stdout
from datetime import datetime, timezone
from io import BytesIO
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from xml.sax.saxutils import escape
from zipfile import ZipFile

import bond_data
import build_site


def model_workbook():
    """Small portable workbook with actual August/September 2026 model observations."""
    observations = [
        ('2026-08-01', 2.4985705, 1.3203746, .4322965, .02190890446408611),
        ('2026-09-01', 2.5726436, 1.3354966, .45791264, .02244900541539742),
    ]
    # Earlier rows exercise monthly parsing and the minimum-history requirement.
    earlier = [(f'2025-{m:02d}-01', 2.5, 1.2, .4, .022) for m in range(10, 13)]
    earlier += [(f'2026-{m:02d}-01', 2.5, 1.2, .4, .022) for m in range(1, 8)]
    rows = earlier + observations
    def sheet(headers, values):
        xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
        for n, cells in enumerate([headers, *values], 1):
            xml += f'<row r="{n}">'
            for column, value in zip('ABCD', cells):
                address = f'{column}{n}'
                xml += f'<c r="{address}" t="inlineStr"><is><t>{escape(value)}</t></is></c>' if isinstance(value, str) else f'<c r="{address}"><v>{value}</v></c>'
            xml += '</row>'
        return xml + '</sheetData></worksheet>'
    dates = [(datetime.strptime(r[0], '%Y-%m-%d') - datetime(1899, 12, 30)).days for r in rows]
    risk = sheet(['Model Output Date', '10 year Expected Inflation', 'Real Risk Premium', 'Inflation Risk Premium'], [[day, *r[1:4]] for day, r in zip(dates, rows)])
    real = sheet(['Model Output Date', 'Real Rate 1-month', 'Real Rate 1-year', 'Real Rate 10-year '], [[day, .01, .02, r[4]] for day, r in zip(dates, rows)])
    result = BytesIO()
    with ZipFile(result, 'w') as archive:
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ten-year Expected Chart" r:id="rId1"/><sheet name="Real Interest Rate" r:id="rId2"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
        archive.writestr('xl/worksheets/sheet1.xml', risk)
        archive.writestr('xl/worksheets/sheet2.xml', real)
    return result.getvalue()


class BondModelTests(unittest.TestCase):
    def setUp(self):
        self.payload = bond_data.parse_model(model_workbook(), datetime(2026, 10, 6, tzinfo=timezone.utc))

    def test_mixed_units_and_four_part_sum_match_video(self):
        latest = self.payload['rows'][-1]
        self.assertEqual(latest['date'], '2026-09-01')
        self.assertAlmostEqual(latest['expectedReal'], .909403941539742)
        self.assertAlmostEqual(latest['nominal'], 5.275456781539742)
        self.assertEqual(latest['inflation'], 2.5726436)
        self.assertAlmostEqual(sum(latest[k] for k in bond_data.FIELDS), latest['nominal'])

    def test_actual_month_change(self):
        previous, latest = self.payload['rows'][-2:]
        self.assertAlmostEqual(latest['nominal']-previous['nominal'], .153699335131132)
        self.assertAlmostEqual(latest['expectedReal']-previous['expectedReal'], .038888095131131)

    def test_invalid_decomposition_is_rejected(self):
        bad = copy.deepcopy(self.payload)
        bad['rows'][-1]['nominal'] += 1
        with self.assertRaisesRegex(ValueError, '四项分解'):
            bond_data.validate(bad)

    def test_duplicate_month_and_nonfinite_values_are_rejected(self):
        bad = copy.deepcopy(self.payload)
        bad['rows'][-1]['date'] = bad['rows'][-2]['date']
        with self.assertRaisesRegex(ValueError, '月份'):
            bond_data.validate(bad)
        bad = copy.deepcopy(self.payload)
        bad['rows'][-1]['expectedReal'] = float('nan')
        with self.assertRaisesRegex(ValueError, '数值异常'):
            bond_data.validate(bad)

    def test_publication_dates_are_separate_from_model_month(self):
        dates = bond_data.publication_dates('<p>Last updated</p><p>September 11, 2026</p><p>Next update</p><p>October 14, 2026</p>')
        self.assertEqual(dates, {'lastPublishedAt': '2026-09-11', 'nextUpdate': '2026-10-14'})
        self.assertNotEqual(dates['lastPublishedAt'], self.payload['asOf'])

    def test_build_failure_preserves_both_snapshots_and_publishes_warning(self):
        root = Path(__file__).resolve().parents[1]
        prices = (root / 'src/snapshot.json').read_text()
        bonds = (root / 'src/bond_snapshot.json').read_text()
        with tempfile.TemporaryDirectory() as folder:
            temporary = Path(folder)
            price_cache = temporary / 'prices.json'
            bond_cache = temporary / 'bonds.json'
            price_cache.write_text(prices)
            bond_cache.write_text(bonds)
            with patch.object(build_site, 'ROOT', temporary), patch.object(build_site, 'STATE', temporary / 'state.json'), patch.object(build_site, 'BOND_CACHE', bond_cache), patch.object(build_site.server, 'CACHE', price_cache), patch.object(build_site.server, 'OUTPUT', temporary / 'unused.html'), patch.object(build_site.server, 'download_symbol', side_effect=ValueError('ETF unavailable')), patch.object(build_site.bond_data, 'download_model', side_effect=ValueError('Fed unavailable')), patch('sys.argv', ['build_site.py', '--allow-cached']), redirect_stdout(io.StringIO()):
                build_site.main()
            self.assertEqual(price_cache.read_text(), prices)
            self.assertEqual(bond_cache.read_text(), bonds)
            published = json.loads((temporary / 'dist/bond-data.json').read_text())
            self.assertEqual(published['data']['asOf'], json.loads(bonds)['asOf'])
            self.assertIn('Fed unavailable', published['warning'])
            self.assertIn('ETF unavailable', json.loads((temporary / 'dist/data.json').read_text())['warning'])
            page = (temporary / 'dist/index.html').read_text()
            self.assertNotIn('__BOND_DATA__', page)
            self.assertIn(str(json.loads(bonds)['rows'][-1]['nominal']), page)


if __name__ == '__main__':
    unittest.main()
