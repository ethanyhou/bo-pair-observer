/* Transparent interpretation of Bo's qualitative explanation, not his trading algorithm. */
(function (root) {
  'use strict';
  const fields = ['expectedReal', 'inflation', 'realPremium', 'inflationPremium'];
  // Match the two-decimal display; this is not a published Bo signal threshold.
  const displayed = value => Number(value.toFixed(2));

  function comparison(allRows, windowRows, scope, selected) {
    if(scope === 'period')return {first:windowRows[0], last:windowRows.at(-1)};
    const index=allRows.findIndex(row=>row.date===selected),last=allRows[index],previous=allRows[index-1];
    if(!last)return {};
    const priorMonth=new Date(last.date+'T00:00:00Z');
    priorMonth.setUTCMonth(priorMonth.getUTCMonth()-1);
    const first=previous?.date===priorMonth.toISOString().slice(0,10)?previous:null;
    return {first,last};
  }

  function analyze(first, last) {
    if(!first || !last || first.date===last.date)return {kind:'insufficient', text:'缺少两个可比较的月份，暂无法根据四条曲线判断美股的风险背景。'};
    if(first.date>last.date || [first,last].some(row=>fields.some(k=>!Number.isFinite(row[k])) || !Number.isFinite(row.nominal) || Math.abs(fields.reduce((sum,k)=>sum+row[k],0)-row.nominal)>1e-8))throw new Error('结论所用的分解数据不一致');
    const deltas=Object.fromEntries([...fields,'nominal'].map(k=>[k,last[k]-first[k]]));
    const inflationDelta=deltas.inflation+deltas.inflationPremium;
    const real=displayed(deltas.expectedReal),inflation=displayed(inflationDelta),premium=displayed(deltas.realPremium),nominal=displayed(deltas.nominal);
    const direction=Math.sign(nominal);
    const groups={expectedReal:real, inflation:inflation, realPremium:premium};
    const largest=Math.max(...Object.values(groups).map(value=>value*direction));
    const leaders=Object.keys(groups).filter(k=>groups[k]*direction===largest && largest>0);
    const driver=leaders.length===1?leaders[0]:'mixed';
    let kind,text;
    if(!direction){
      kind='flat';
      text=fields.every(k=>displayed(deltas[k])===0)?'四项分解与模型债息在两位小数下基本不变，按 Bo 的思路，暂没有新的债市方向线索。':'模型债息净变化很小，四项分解相互抵消，按 Bo 的思路需继续区分增长、通胀与风险补偿，暂不能据此判断美股方向。';
    }else if(direction>0){
      if(real<0){
        kind='rising-with-growth-risk';
        text='模型债息上升而实际利率预期下降，按 Bo 的思路需同时警惕增长转弱与通胀或利率风险补偿上升，美股可能面临盈利和估值压力。';
      }else if(driver==='expectedReal'){
        kind='real-driven-rise';
        const pressure=inflation>0 && premium>0?'通胀与利率风险补偿上升':inflation>0?'通胀因素上升':premium>0?'利率风险补偿上升':'更高的实际利率';
        text='模型债息上升，实际利率预期的增量最大，按 Bo 的解读可能反映增长和资本需求较强，但'+pressure+'仍可能给美股估值带来压力。';
      }else if(driver==='inflation'){
        kind='inflation-driven-rise';
        text='模型债息上升，通胀因素的增量最大，按 Bo 的思路应关注通胀定价与政策压力对美股估值的拖累。';
      }else if(driver==='realPremium'){
        kind='premium-driven-rise';
        text='模型债息上升，实际利率风险溢价的增量最大，反映利率不确定性的补偿增加，美股融资与估值压力可能上升。';
      }else{
        kind='mixed-rise';
        text='模型债息上升，多个驱动项的增量相同，按 Bo 的思路需区分增长支撑与通胀、风险补偿造成的估值压力。';
      }
    }else if(real<0 && -real>Math.max(0,-inflation)){
      kind='falling-with-growth-risk';
      text=driver==='realPremium'?'模型债息下降且实际利率风险溢价的降幅最大，但实际利率预期比通胀因素降得更快，需同时关注风险补偿回落与增长转弱对美股的相反影响。':'模型债息下降，但实际利率预期比通胀因素降得更快，按 Bo 的思路需警惕增长和盈利转弱，不能仅凭债息回落看多美股。';
    }else if(driver==='inflation'){
      kind=real<0?'inflation-relief-with-growth-caution':'inflation-relief';
      text='模型债息下降，通胀因素的降幅最大'+(real<0?'，按 Bo 的思路可能缓解美股估值压力，但实际利率预期也在回落，增长支撑仍需确认。':'且实际利率预期未下降，按 Bo 的思路可能为美股估值提供支持。');
    }else if(driver==='realPremium'){
      kind='premium-relief';
      text='模型债息下降，实际利率风险溢价的降幅最大，利率不确定性的定价补偿减少，可能缓解美股估值压力。';
    }else{
      kind='mixed-fall';
      text=real<0?'模型债息下降，多个驱动项的降幅相同且实际利率预期也在回落，按 Bo 的思路需同时关注估值压力缓解与增长转弱的风险。':'模型债息下降，多个驱动项的降幅相同，可能缓解美股估值压力，但仍需结合增长背景判断。';
    }
    return {kind,driver,deltas,inflationDelta,text};
  }

  const api={comparison,analyze};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.BondReading=api;
})(typeof globalThis!=='undefined'?globalThis:this);
