/* A transparent adaptation of Bo's public commentary, not his trading system. */
(function (root) {
  'use strict';
  const allocation = {QQQ:15, TQQQ:45, BOXX:40};
  function evaluate({data, main, fast, params, now = new Date()}) {
    const defaults = {lookback:35,smoothing:1,band:0,confirmation:2,trendConfirmation:true,priceBasis:'close'};
    const result = {asOf:data.asOf, mode:'unavailable', pairs:[], weights:null, dipObservation:false, qqqDailyChange:null};
    if(Object.entries(defaults).some(([key,value])=>params[key]!==value))return {...result,mode:'custom'};
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const age = (Date.parse(today+'T00:00:00Z')-Date.parse(data.asOf+'T00:00:00Z'))/86400000;
    if(!Number.isFinite(age)||age<0)return result;
    for(const symbol of ['VTV','CGDV']) {
      const slow = main[symbol].at(-1), previousSlow = main[symbol].at(-2);
      const quick = fast[symbol].at(-1), previousQuick = fast[symbol].at(-2);
      if(![slow,previousSlow,quick,previousQuick].every(r=>r&&Number.isFinite(r.value)) || slow.date!==data.asOf || quick.date!==data.asOf)return result;
      result.pairs.push({symbol,slow:slow.value,fast:quick.value,state:slow.state,
        slowDelta:slow.value-previousSlow.value,fastDelta:quick.value-previousQuick.value,
        lastSwitch:main[symbol].filter(r=>r.changed).at(-1)?.date||null});
    }
    const qqq=data.series.QQQ, close=qqq.at(-1), previous=qqq.at(-2);
    if(!close||!previous||close.date!==data.asOf||!(close.close>0)||!(previous.close>0))return result;
    result.qqqDailyChange=100*(close.close/previous.close-1);
    if(age>5)return {...result,mode:'stale'};
    const riskOn=result.pairs.every(p=>p.slow<0&&p.fast<0&&p.state===-1);
    const riskOff=result.pairs.every(p=>p.slow>0&&p.fast>0&&p.state===1);
    result.mode=riskOn?'risk-on':riskOff?'risk-off':'mixed';
    // This observable proxy is an explicitly disclosed local choice. Bo did not
    // publish a numerical definition of a substantial dip or fixed buy tranches.
    result.dipObservation=riskOn&&result.qqqDailyChange<0&&result.pairs.every(p=>p.slowDelta<0&&p.fastDelta<0);
    result.weights=riskOn?{...allocation}:null;
    return result;
  }
  const api={evaluate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PairStrategy=api;
})(typeof globalThis!=='undefined'?globalThis:this);
