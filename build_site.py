#!/usr/bin/env python3
"""Build a self-contained GitHub Pages site and validated daily price snapshot."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
from datetime import datetime, timezone
import bond_data

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('pair_server', ROOT / 'src/serve.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
STATE = ROOT / 'publish_state.json'
BOND_CACHE = ROOT / 'src/bond_snapshot.json'


def validate(payload):
    if payload.get('version') != 2:
        raise ValueError('Unsupported snapshot version')
    for symbol in server.SYMBOLS:
        rows = payload['series'][symbol]
        if len(rows) < 300 or rows[-1]['date'] != payload['asOf']:
            raise ValueError(f'{symbol}: incomplete or unaligned dates')
        prior = ''
        for row in rows:
            if row['date'] <= prior or row['date'] > payload['asOf']:
                raise ValueError(f'{symbol}: unordered or future date')
            for field in ('close', 'adjClose'):
                if row[field] is not None and not (row[field] > 0 and server.math.isfinite(row[field])):
                    raise ValueError(f'{symbol}: invalid {field}')
            prior = row['date']
        if not rows[-1]['close'] or not rows[-1]['adjClose']:
            raise ValueError(f'{symbol}: invalid final closing price')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true', help='Build existing data without any network requests')
    parser.add_argument('--allow-cached', action='store_true', help='Publish a visible warning with the previous snapshot when the provider fails')
    args = parser.parse_args()
    cached = json.loads(server.CACHE.read_text())
    validate(cached)
    updated, warning = False, None
    bond_payload = json.loads(BOND_CACHE.read_text())
    bond_data.validate(bond_payload)
    if args.offline:
        payload = cached
        state = json.loads(STATE.read_text()) if STATE.exists() else {}
        warning = state.get('warning')
    else:
        try:
            with server.concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                raws = dict(zip(server.SYMBOLS, executor.map(server.download_symbol, server.SYMBOLS)))
            payload = server.make_payload(raws)
            validate(payload)
            if payload['asOf'] < cached['asOf']:
                raise ValueError('行情截止日早于已有快照，已保留原数据')
            server.atomic_write(server.CACHE, json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
            updated = True
        except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
            if not args.allow_cached:
                raise
            payload = cached
            warning = f'最近一次云端行情更新失败：{error}'
            print('::warning::' + warning)
        state = {'lastAttempt': datetime.now(timezone.utc).isoformat(), 'asOf': payload['asOf'], 'warning': warning}
        bond_warning = None
        try:
            fresh_bonds = bond_data.download_model()
            if fresh_bonds['asOf'] < bond_payload['asOf']:
                raise ValueError('官方模型月份早于缓存，已保留原数据')
            bond_payload = fresh_bonds
            server.atomic_write(BOND_CACHE, json.dumps(bond_payload, ensure_ascii=False, separators=(',', ':')))
        except Exception as error:
            if not args.allow_cached:
                raise
            bond_warning = f'最近一次债市模型更新失败：{error}'
            print('::warning::' + bond_warning)
        state.update({'bondWarning': bond_warning, 'bondAsOf': bond_payload['asOf']})
        server.atomic_write(STATE, json.dumps(state, ensure_ascii=False, indent=2) + '\n')
    site = ROOT / 'dist'
    site.mkdir(exist_ok=True)
    server.OUTPUT = site / 'index.html'
    server.build_page(payload, bond_payload, state.get('bondWarning'))
    html = server.OUTPUT.read_text()
    html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-pair-deployment="github-pages">')
    server.atomic_write(server.OUTPUT, html)
    server.atomic_write(site / 'data.json', json.dumps({'data': payload, 'warning': warning, 'lastAttempt': state.get('lastAttempt')}, ensure_ascii=False, separators=(',', ':')))
    server.atomic_write(site / 'bond-data.json', json.dumps({'data': bond_payload, 'warning': state.get('bondWarning')}, ensure_ascii=False, separators=(',', ':')))
    (site / '.nojekyll').touch()
    if '__PAIR_DATA__' in html or '__BOND_DATA__' in html or '/*__APP__*/' in html or '/*__BONDS__*/' in html:
        raise ValueError('Unresolved page placeholders')
    summary = f'Price data through {payload["asOf"]} (New York); ' + ('fresh provider fetch' if updated else 'existing snapshot')
    print(summary)
    print(f'Cleveland Fed monthly model through {bond_payload["asOf"]}; four-part sum validated.')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
            stream.write(summary + '\n\n' + (warning or 'All three ETF snapshots validated.') + '\n')
            stream.write(f'\nCleveland Fed model month: {bond_payload["asOf"]}. ' + (state.get('bondWarning') or 'Four-part sum validated.') + '\n')


if __name__ == '__main__':
    main()
