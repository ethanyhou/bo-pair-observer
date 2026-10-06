#!/usr/bin/env python3
"""Local, read-only daily pair dashboard. Python standard library only."""
from __future__ import annotations
import argparse
import concurrent.futures
from datetime import datetime, timezone, time as dt_time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import webbrowser
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / 'snapshot.json'
OUTPUT = ROOT.parent / 'bo_pair_dashboard.html'
NY = ZoneInfo('America/New_York')
SYMBOLS = ('QQQ', 'VTV', 'CGDV')
LOCK = threading.Lock()


def normalize(symbol, result, now=None):
    now = now or datetime.now(timezone.utc)
    local_now = now.astimezone(NY)
    meta = result.get('meta', {})
    if meta.get('symbol') != symbol or meta.get('currency') != 'USD':
        raise ValueError(f'{symbol} 行情品种或币种不匹配')
    if meta.get('exchangeTimezoneName') != 'America/New_York':
        raise ValueError(f'{symbol} 行情时区不匹配')
    closes = result['indicators']['adjclose'][0]['adjclose']
    price_closes = result['indicators']['quote'][0]['close']
    timestamps = result['timestamp']
    if len(closes) != len(timestamps) or len(price_closes) != len(timestamps):
        raise ValueError(f'{symbol} 行情长度不一致')
    regular = meta.get('currentTradingPeriod', {}).get('regular', {})
    end = regular.get('end')
    rows, seen = [], set()
    for ts, close, price_close in zip(timestamps, closes, price_closes):
        day = datetime.fromtimestamp(ts, NY).date()
        if day > local_now.date():
            continue
        if day == local_now.date():
            # A 15-minute buffer after the provider's regular session close.
            # Fall back to 16:00 New York when today's session is not supplied.
            session_end = end if end and datetime.fromtimestamp(end, NY).date() == day else datetime.combine(day, dt_time(16), NY).timestamp()
            if now.timestamp() < session_end + 900:
                continue
        if close is not None and (not isinstance(close, (int, float)) or not math.isfinite(close) or close <= 0):
            raise ValueError(f'{symbol} 价格异常')
        if price_close is not None and (not isinstance(price_close, (int, float)) or not math.isfinite(price_close) or price_close <= 0):
            raise ValueError(f'{symbol} 收盘价异常')
        if day in seen:
            raise ValueError(f'{symbol} 包含重复日线')
        seen.add(day)
        rows.append({'date': day.isoformat(), 'close': price_close, 'adjClose': close})
    rows.sort(key=lambda r: r['date'])
    if sum(r['adjClose'] is not None and r['close'] is not None for r in rows) < 300:
        raise ValueError(f'{symbol} 历史数据不足')
    return rows


def download_symbol(symbol):
    last_error = None
    for attempt in range(4):
        host = 'query1' if attempt % 2 == 0 else 'query2'
        url = f'https://{host}.finance.yahoo.com/v8/finance/chart/{symbol}?range=5y&interval=1d&events=div%2Csplits'
        request = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
        try:
            with urlopen(request, timeout=18) as response:
                obj = json.load(response)
            if obj.get('chart', {}).get('error') or not obj.get('chart', {}).get('result'):
                raise ValueError(f'{symbol} 行情服务未返回数据')
            return obj['chart']['result'][0]
        except (OSError, ValueError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(2 ** attempt)
    raise ValueError(f'{symbol} 行情抓取失败（已重试两个接口）：{last_error}')


def make_payload(raws, now=None):
    now = now or datetime.now(timezone.utc)
    series = {symbol: normalize(symbol, raws[symbol], now) for symbol in SYMBOLS}
    shared_days = set.intersection(*(set(r['date'] for r in series[s] if r['adjClose'] is not None and r['close'] is not None) for s in SYMBOLS))
    if not shared_days:
        raise ValueError('三只 ETF 没有共同交易日')
    as_of = max(shared_days)
    for symbol in SYMBOLS:
        series[symbol] = [r for r in series[symbol] if r['date'] <= as_of]
    return {'version': 2, 'asOf': as_of, 'fetchedAt': now.isoformat(),
            'source': 'Yahoo Finance', 'priceBasis': 'close: split-adjusted, not dividend-adjusted; adjClose: split and dividend adjusted',
            'series': series}


def atomic_write(path, content):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(content, encoding='utf-8')
    temp.replace(path)


def build_page(payload, bond_payload=None, bond_warning=None):
    html = (ROOT / 'page.html').read_text(encoding='utf-8')
    html = html.replace('/*__STYLE__*/', (ROOT / 'style.css').read_text(encoding='utf-8'))
    html = html.replace('__PAIR_DATA__', json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'))
    observations = json.loads((ROOT / 'evidence/video_observations.json').read_text(encoding='utf-8'))
    html = html.replace('__PAIR_EVIDENCE__', json.dumps(observations, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'))
    html = html.replace('/*__MATH__*/', (ROOT / 'pair_math.js').read_text(encoding='utf-8'))
    html = html.replace('/*__STRATEGY__*/', (ROOT / 'strategy.js').read_text(encoding='utf-8'))
    html = html.replace('/*__APP__*/', (ROOT / 'app.js').read_text(encoding='utf-8'))
    if bond_payload is None:
        bond_payload = json.loads((ROOT / 'bond_snapshot.json').read_text(encoding='utf-8'))
    html = html.replace('__BOND_DATA__', json.dumps({'data': bond_payload, 'warning': bond_warning}, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'))
    html = html.replace('/*__BONDS__*/', (ROOT / 'bonds.js').read_text(encoding='utf-8'))
    atomic_write(OUTPUT, html)


def update_data():
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        raws = dict(zip(SYMBOLS, executor.map(download_symbol, SYMBOLS)))
    payload = make_payload(raws)
    if CACHE.exists():
        previous = json.loads(CACHE.read_text(encoding='utf-8'))
        if payload['asOf'] < previous['asOf']:
            raise ValueError('新行情截止日早于缓存，已保留缓存')
    # Build only after all three series pass validation; never publish a partial update.
    build_page(payload)
    atomic_write(CACHE, json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    return payload


def get_data(force=False):
    with LOCK:
        cached = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else None
        if cached and cached.get('version') == 2 and not force:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(cached['fetchedAt'])).total_seconds()
            if 0 <= age < 3600:
                return cached, None
        try:
            return update_data(), None
        except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
            if cached:
                return cached, '行情服务暂不可用：' + str(error)
            raise


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # The service deliberately binds to loopback and exposes only its dashboard.
        expected = {'127.0.0.1:' + str(self.server.server_port), 'localhost:' + str(self.server.server_port)}
        if self.headers.get('Host') not in expected:
            self.send_error(403)
            return
        origin = self.headers.get('Origin')
        if origin and origin not in {'http://' + h for h in expected}:
            self.send_error(403)
            return
        route = urlsplit(self.path)
        if route.path == '/health':
            self.reply_json({'app': 'pair-observer', 'version': 1})
        elif route.path == '/api/data':
            try:
                payload, warning = get_data(force=route.query == 'refresh=1')
                self.reply_json({'data': payload, 'warning': warning})
            except Exception as error:
                self.reply_json({'error': str(error)}, 503)
        elif route.path in ('/', '/index.html'):
            if not OUTPUT.exists():
                try:
                    payload, _ = get_data()
                    build_page(payload)
                except Exception:
                    self.send_error(503, 'Market data unavailable')
                    return
            self.reply(OUTPUT.read_bytes(), 'text/html; charset=utf-8')
        elif route.path == '/bond-data.json':
            self.reply_json({'data': json.loads((ROOT / 'bond_snapshot.json').read_text(encoding='utf-8')), 'warning': None})
        else:
            self.send_error(404)

    def reply(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(body)

    def reply_json(self, value, status=200):
        self.reply(json.dumps(value, ensure_ascii=False).encode(), 'application/json; charset=utf-8', status)

    def log_message(self, fmt, *args):
        print('[pair-observer] ' + fmt % args, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true')
    parser.add_argument('--build', action='store_true')
    args = parser.parse_args()
    if args.build:
        with LOCK:
            payload = update_data()
        print(f"Built {OUTPUT}: {payload['asOf']}")
        return
    url = f'http://127.0.0.1:{args.port}/'
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError:
        try:
            with urlopen(url + 'health', timeout=2) as response:
                existing = json.load(response)
            if existing.get('app') == 'pair-observer':
                if args.open:
                    webbrowser.open(url)
                print('Dashboard already running: ' + url)
                return
        except Exception:
            pass
        raise SystemExit(f'Port {args.port} is occupied. Use --port with another port.')
    if CACHE.exists():
        build_page(json.loads(CACHE.read_text(encoding='utf-8')))
    print('Pair Observer: ' + url, flush=True)
    if args.open:
        threading.Timer(.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
