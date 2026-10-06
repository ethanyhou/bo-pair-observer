/* Video-calibrated causal reconstruction. Not the author's source code. */
(function (root) {
  'use strict';
  function settings(input = {}) {
    const p = {lookback: 35, smoothing: 1, band: 0, confirmation: 2, trendConfirmation: true, priceBasis: 'close', ...input};
    for (const [key, min, max] of [['lookback', 1, 250], ['smoothing', 1, 100], ['confirmation', 1, 20]]) {
      if (!Number.isInteger(p[key]) || p[key] < min || p[key] > max) throw new Error('参数超出范围：' + key);
    }
    if (!Number.isFinite(p.band) || p.band < 0 || p.band > 20) throw new Error('阈值须在 0–20% 之间');
    if (!['close','adjClose'].includes(p.priceBasis)) throw new Error('未知价格口径');
    if (typeof p.trendConfirmation !== 'boolean') throw new Error('确认方向设置无效');
    return p;
  }
  function calculate(asset, benchmark, input = {}) {
    const p = settings(input), a = new Map(asset.map(x => [x.date, x[p.priceBasis]]));
    const alpha = 2 / (p.smoothing + 1), out = [];
    let ema = null, state = 0, above = 0, below = 0, validRun = 0;
    for (let i = 0; i < benchmark.length; i++) {
      const b = benchmark[i], av = a.get(b.date), bv = b[p.priceBasis];
      const good = Number.isFinite(av) && av > 0 && Number.isFinite(bv) && bv > 0;
      validRun = good ? validRun + 1 : 0;
      let raw = null, value = null, rocA = null, rocB = null, changed = false;
      if (validRun > p.lookback) {
        const previous = benchmark[i - p.lookback], ap = a.get(previous.date);
        const grossA = av / ap, grossB = bv / previous[p.priceBasis];
        rocA = 100 * (grossA - 1); rocB = 100 * (grossB - 1);
        raw = 100 * (grossA / grossB - 1);
        const previousValue = ema;
        ema = ema === null ? raw : alpha * raw + (1 - alpha) * ema;
        value = ema;
        above = value > p.band ? above + 1 : 0;
        below = value < -p.band ? below + 1 : 0;
        const rising = !p.trendConfirmation || (previousValue !== null && value > previousValue);
        const falling = !p.trendConfirmation || (previousValue !== null && value < previousValue);
        const next = above >= p.confirmation && rising ? 1 : below >= p.confirmation && falling ? -1 : state;
        changed = next !== state; state = next;
      } else {
        ema = null; state = 0; above = 0; below = 0;
      }
      out.push({date: b.date, raw, value, rocA, rocB, state, changed});
    }
    return out;
  }
  const api = {settings, calculate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PairMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
