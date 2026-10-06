const {test}=require('node:test');
const assert=require('node:assert/strict');
const {analyze,comparison}=require('../src/bond_reading.js');

function row(date,expectedReal,inflation,realPremium,inflationPremium){
  return {date,expectedReal,inflation,realPremium,inflationPremium,nominal:expectedReal+inflation+realPremium+inflationPremium};
}
const april=row('2026-04-01',.40188121270266075,2.4187847,1.1919907,.29203643);
const august=row('2026-08-01',.8705158464086109,2.4985705,1.3203746,.4322965);
const september=row('2026-09-01',.9094039415397419,2.5726436,1.3354966,.45791264);
const base=row('2026-01-01',1,2,1,.5);
const changed=(real,inflation,premium,inflationPremium)=>row('2026-02-01',1+real,2+inflation,1+premium,.5+inflationPremium);

test('official April–September and August–September observations give different drivers',()=>{
  const period=analyze(april,september),monthly=analyze(august,september);
  assert.equal(period.kind,'real-driven-rise');
  assert.equal(period.driver,'expectedReal');
  assert.match(period.text,/增长和资本需求较强.*通胀与利率风险补偿上升/);
  assert.ok(Math.abs(period.deltas.nominal-.97076373883708)<1e-10);
  assert.equal(monthly.kind,'inflation-driven-rise');
  assert.equal(monthly.driver,'inflation');
  assert.match(monthly.text,/通胀因素的增量最大.*估值/);
  assert.ok(Math.abs(monthly.inflationDelta-.09968924)<1e-10);
});

test('real risk premium is not labeled stronger growth',()=>{
  const result=analyze(base,changed(.01,.01,.3,.01));
  assert.equal(result.kind,'premium-driven-rise');
  assert.match(result.text,/不确定性/);
  assert.doesNotMatch(result.text,/增长.*较强/);
});

test('inflation expectation and inflation risk premium are both included, even when opposing',()=>{
  const higherPremium=analyze(base,changed(0,-.1,0,.3));
  assert.equal(higherPremium.kind,'inflation-driven-rise');
  const lowerPremium=analyze(base,changed(.01,.3,0,-.5));
  assert.equal(lowerPremium.kind,'inflation-relief');
  assert.ok(lowerPremium.inflationDelta<0);
});

test('falling expected real rate with rising yields retains growth risk',()=>{
  const result=analyze(base,changed(-.1,.3,.05,.1));
  assert.equal(result.kind,'rising-with-growth-risk');
  assert.match(result.text,/增长转弱.*盈利和估值压力/);
});

test('a faster fall in expected real rate is not automatically bullish',()=>{
  const result=analyze(base,changed(-.4,-.1,0,-.05));
  assert.equal(result.kind,'falling-with-growth-risk');
  assert.match(result.text,/增长和盈利转弱/);
  assert.doesNotMatch(result.text,/提供支持/);
});

test('growth caution persists when premium relief is the largest fall',()=>{
  const result=analyze(base,changed(-.1,-.02,-.4,0));
  assert.equal(result.driver,'realPremium');
  assert.equal(result.kind,'falling-with-growth-risk');
  assert.match(result.text,/风险补偿回落与增长转弱/);
});

test('inflation relief is conditional on the expected real-rate direction',()=>{
  const stableGrowth=analyze(base,changed(.02,-.3,0,-.1));
  assert.equal(stableGrowth.kind,'inflation-relief');
  assert.match(stableGrowth.text,/实际利率预期未下降/);
  const softerGrowth=analyze(base,changed(-.03,-.3,0,-.1));
  assert.equal(softerGrowth.kind,'inflation-relief-with-growth-caution');
  assert.match(softerGrowth.text,/增长支撑仍需确认/);
});

test('risk premium relief without weaker real expectations is distinguished',()=>{
  const result=analyze(base,changed(.01,0,-.3,0));
  assert.equal(result.kind,'premium-relief');
  assert.match(result.text,/不确定性/);
});

test('equal contributions remain mixed, including real and inflation falls',()=>{
  const rise=analyze(base,changed(.1,.08,0,.02));
  assert.equal(rise.kind,'mixed-rise');
  assert.equal(rise.driver,'mixed');
  const fall=analyze(base,changed(-.1,-.08,0,-.02));
  assert.equal(fall.kind,'mixed-fall');
  assert.match(fall.text,/增长转弱/);
});

test('zero nominal change still exposes offsetting internal drivers',()=>{
  const result=analyze(base,changed(.1,-.1,0,0));
  assert.equal(result.kind,'flat');
  assert.match(result.text,/相互抵消/);
});

test('sub-display-precision changes are neutral and ties are not overinterpreted',()=>{
  const flat=analyze(base,changed(.001,.001,0,0));
  assert.equal(flat.kind,'flat');
  assert.match(flat.text,/基本不变/);
  const tie=analyze(base,changed(.041,.04,0,0));
  assert.equal(tie.kind,'mixed-rise');
});

test('period comparison follows chart endpoints, month comparison can use an off-chart previous month',()=>{
  const all=[april,august,september],window=[september];
  assert.deepEqual(comparison(all,window,'period',september.date),{first:september,last:september});
  assert.deepEqual(comparison(all,window,'month',september.date),{first:august,last:september});
  assert.equal(analyze(...Object.values(comparison(all,window,'period',september.date))).kind,'insufficient');
});

test('missing calendar months never masquerade as month-on-month changes',()=>{
  const result=comparison([april,september],[april,september],'month',september.date);
  assert.equal(result.first,null);
  assert.equal(analyze(result.first,result.last).kind,'insufficient');
  assert.equal(analyze(null,null).kind,'insufficient');
});

test('December-to-January is a valid adjacent-month comparison',()=>{
  const december=row('2025-12-01',1,2,1,.5);
  assert.equal(comparison([december,base],[base],'month',base.date).first,december);
});

test('selecting historical months does not look ahead when new data arrives',()=>{
  const earlier=comparison([august,september],[august,september],'month',september.date);
  const october=row('2026-10-01',.4,2,1,.2);
  const updated=comparison([august,september,october],[august,september,october],'month',september.date);
  assert.deepEqual(updated,earlier);
  const newMonth=comparison([august,september,october],[august,september,october],'month',october.date);
  assert.notEqual(analyze(newMonth.first,newMonth.last).kind,analyze(earlier.first,earlier.last).kind);
});

test('invalid or reversed decompositions do not produce confident conclusions',()=>{
  assert.throws(()=>analyze(base,{...september,nominal:99}),/不一致/);
  assert.throws(()=>analyze(base,{...september,expectedReal:NaN}),/不一致/);
  assert.throws(()=>analyze(september,base),/不一致/);
});

test('every scenario renders one sentence without trade instructions or return probabilities',()=>{
  for(const deltas of [[.4,.1,0,.01],[0,.3,0,.1],[0,0,.3,0],[-.1,.4,0,0],[-.4,-.1,0,0],[0,-.3,0,0],[0,0,-.3,0],[.1,.1,0,0],[-.1,-.1,0,0],[.1,-.1,0,0]]){
    const text=analyze(base,changed(...deltas)).text;
    assert.equal((text.match(/。/g)||[]).length,1);
    assert.doesNotMatch(text,/买入|卖出|加仓|减仓|\d+%|必涨|必跌|股市安全/);
  }
});
