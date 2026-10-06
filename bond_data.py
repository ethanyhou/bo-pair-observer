"""Read the Cleveland Fed's monthly model, using only the Python standard library."""
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from io import BytesIO
import math
import posixpath
import re
import time
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile

SOURCE_URL = 'https://www.clevelandfed.org/indicators-and-data/inflation-expectations'
DOWNLOAD_URL = 'https://www.clevelandfed.org/-/media/files/webcharts/inflationexpectations/inflation-expectations.xlsx?sc_lang=en'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
FIELDS = ('expectedReal', 'inflation', 'realPremium', 'inflationPremium')


def get_bytes(url):
    last_error = None
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'Bo-Pair-Observer/1.0', 'Accept': '*/*'}), timeout=20) as response:
                return response.read()
        except OSError as error:
            last_error = error
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise ValueError(f'克利夫兰联储数据获取失败：{last_error}')


class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, value):
        if not self.hidden and value.strip():
            self.parts.append(value.strip())


def publication_dates(html):
    parser = PageText()
    parser.feed(html)
    text = '\n'.join(parser.parts)
    dates = {}
    for label, field in [('Last updated', 'lastPublishedAt'), ('Next update', 'nextUpdate')]:
        match = re.search(re.escape(label) + r'\s+([A-Za-z]+ \d{1,2}, \d{4})', text)
        dates[field] = datetime.strptime(match[1], '%B %d, %Y').date().isoformat() if match else None
    return dates


def workbook_tables(content):
    with ZipFile(BytesIO(content)) as archive:
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        links = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            for si in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS):
                strings.append(''.join(t.text or '' for t in si.findall('.//m:t', NS)))
        result = {}
        for sheet in workbook.findall('m:sheets/m:sheet', NS):
            target = links[sheet.get('{' + REL + '}id')]
            path = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            rows = []
            for row in ET.fromstring(archive.read(path)).findall('m:sheetData/m:row', NS):
                cells = {}
                for cell in row.findall('m:c', NS):
                    column = re.sub(r'\d+', '', cell.get('r', ''))
                    value = cell.find('m:v', NS)
                    raw = value.text if value is not None else ''
                    if cell.get('t') == 's':
                        raw = strings[int(raw)]
                    elif cell.get('t') == 'inlineStr':
                        raw = ''.join(t.text or '' for t in cell.findall('.//m:t', NS))
                    cells[column] = raw
                rows.append(cells)
            result[sheet.get('name')] = rows
        return result


def parse_model(content, now=None):
    now = now or datetime.now(timezone.utc)
    tables = workbook_tables(content)
    risk = tables['Ten-year Expected Chart']
    real = tables['Real Interest Rate']
    expected_headers = {'A': 'Model Output Date', 'B': '10 year Expected Inflation', 'C': 'Real Risk Premium', 'D': 'Inflation Risk Premium'}
    if {k: v.strip() for k, v in risk[0].items()} != expected_headers or real[0].get('D', '').strip() != 'Real Rate 10-year':
        raise ValueError('官方表格字段发生变化，暂停发布债市新数据')
    real_by_date = {r['A']: float(r['D']) * 100 for r in real[1:] if r.get('A') and r.get('D')}
    rows = []
    for row in risk[1:]:
        if not row.get('A'):
            continue
        day = (datetime(1899, 12, 30) + timedelta(days=float(row['A']))).date()
        if day > now.date():
            continue
        # The real-rate tab is decimal, but the risk-premia tab is already percent.
        real_rate = real_by_date[row['A']]
        premium = float(row['C'])
        inflation = float(row['B'])
        inflation_premium = float(row['D'])
        rows.append({'date': day.isoformat(), 'expectedReal': real_rate - premium,
                     'inflation': inflation, 'realPremium': premium, 'inflationPremium': inflation_premium,
                     'nominal': real_rate + inflation + inflation_premium})
    payload = {'version': 1, 'frequency': 'monthly', 'asOf': rows[-1]['date'], 'fetchedAt': now.isoformat(),
               'source': 'Federal Reserve Bank of Cleveland', 'sourceUrl': SOURCE_URL, 'downloadUrl': DOWNLOAD_URL,
               'lastPublishedAt': None, 'nextUpdate': None, 'rows': rows}
    validate(payload)
    return payload


def validate(payload):
    if payload.get('version') != 1 or payload.get('frequency') != 'monthly' or len(payload.get('rows', [])) < 12:
        raise ValueError('债市模型数据不完整')
    prior = ''
    for row in payload['rows']:
        day = datetime.strptime(row['date'], '%Y-%m-%d').date()
        if day.day != 1 or row['date'] <= prior or row['date'] > payload['asOf']:
            raise ValueError('债市模型月份重复、乱序或超出截止日')
        for field in (*FIELDS, 'nominal'):
            if not isinstance(row[field], (int, float)) or not math.isfinite(row[field]) or abs(row[field]) > 30:
                raise ValueError(f'债市模型 {field} 数值异常')
        if abs(sum(row[k] for k in FIELDS) - row['nominal']) > 1e-9:
            raise ValueError('债市四项分解之和不等于模型名义收益率')
        prior = row['date']
    if payload['asOf'] != prior:
        raise ValueError('债市模型截止月份不一致')


def download_model():
    payload = parse_model(get_bytes(DOWNLOAD_URL))
    payload.update(publication_dates(get_bytes(SOURCE_URL).decode('utf-8')))
    return payload
