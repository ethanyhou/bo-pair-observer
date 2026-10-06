(() => {
  'use strict';
  const $ = id => document.getElementById(id), symbols = ['VTV', 'CGDV'];
  let data, calculated = {}, fastCalculated = {}, plots = {}, params, range = 126, selected = null;
  const evidence = JSON.parse($('embeddedEvidence').textContent);
  const isHosted = /^https?:$/.test(location.protocol);
  const isPages = isHosted && document.documentElement.dataset.pairDeployment === 'github-pages';
  const curveButtons = symbol => document.querySelectorAll('[data-symbol="'+symbol+'"] [data-curve]');
  const visibleCurves = symbol => Object.fromEntries([...curveButtons(symbol)].map(b => [b.dataset.curve, b.getAttribute('aria-pressed') === 'true']));
  const riskName = state => state < 0 ? 'Risk On' : state > 0 ? 'Risk Off' : '待确认';
  const riskClass = state => state < 0 ? 'risk-on' : state > 0 ? 'risk-off' : 'risk-pending';
  const riskButton = symbol => document.querySelector('[data-symbol="'+symbol+'"] [data-risk-labels]');
  const riskTooltip = $('riskTooltip');
  let riskHelpAnchor=null, riskHelpTimer=null, riskHelpPinned=false;
  function addRiskHelp(element, state, context) {
    if(!state)return;
    element.dataset.riskHelp=String(state);
    element.dataset.riskContext=context||'';
    element.setAttribute('aria-describedby','riskTooltip');
    if(element.tagName!=='BUTTON'){element.setAttribute('tabindex','0');element.setAttribute('role','button');}
    element.setAttribute('aria-label',(context?context+' · ':'')+riskName(state)+'：查看操作说明');
  }
  function hideRiskHelp() {
    clearTimeout(riskHelpTimer);riskTooltip.hidden=true;riskHelpAnchor=null;riskHelpPinned=false;
  }
  function deferHideRiskHelp() {
    clearTimeout(riskHelpTimer);if(!riskHelpPinned)riskHelpTimer=setTimeout(hideRiskHelp,180);
  }
  function showRiskHelp(anchor, pinned=false) {
    clearTimeout(riskHelpTimer);
    if(riskHelpAnchor===anchor&&!riskTooltip.hidden){riskHelpPinned=pinned||riskHelpPinned;return;}
    riskHelpAnchor=anchor;riskHelpPinned=pinned;
    const on=Number(anchor.dataset.riskHelp)<0;
    riskTooltip.className='risk-tooltip '+(on?'risk-on':'risk-off');riskTooltip.replaceChildren();
    const heading=document.createElement('strong');heading.className='risk-tooltip-heading';
    heading.textContent=on?'Risk On · 增加或维持纳指敞口':'Risk Off · 降低风险、转向防御';riskTooltip.append(heading);
    if(anchor.dataset.riskContext){const context=document.createElement('div');context.className='risk-tooltip-context';context.textContent=anchor.dataset.riskContext;riskTooltip.append(context);}
    const paragraphs=[
      ['Bo 的操作思路',on?'持有或分批增加纳指多头仓位；市场明显回落、配对指标仍向下时执行加仓计划。没有合适回落时继续持有。':'控制成长股风险；出现明确避险或派发迹象时重新平衡仓位。已核查视频没有给出每次固定减仓多少的统一规则。'],
      ['30／35 日的区别','30 日用于较早观察，35 日用于进一步确认。Bo 曾先买一部分 TQQQ，再等 35 日线确认后继续分批增加。'],
      ['QQQ／TQQQ／BOXX（本页改写）',on?'评估维持或增加 QQQ／TQQQ 的纳指敞口，BOXX 作为停泊部分。':'评估减少 TQQQ、提高 BOXX 停泊比例。']
    ];
    for(const [label,text] of paragraphs){const p=document.createElement('p'),b=document.createElement('b');b.textContent=label+'：';p.append(b,document.createTextNode(text));riskTooltip.append(p);}
    const note=document.createElement('p');note.className='risk-tooltip-note';note.textContent='Bo 未公布这三只基金的固定切换比例；具体操作还需结合确认程度与市场条件。';riskTooltip.append(note);
    const hint=document.createElement('div');hint.className='risk-tooltip-hint';hint.textContent='点击标签固定提示 · Esc 或点击空白处关闭';riskTooltip.append(hint);
    riskTooltip.hidden=false;positionRiskHelp();
  }
  function positionRiskHelp() {
    if(!riskHelpAnchor||riskTooltip.hidden)return;
    if(!riskHelpAnchor.isConnected){hideRiskHelp();return;}
    const bounds=riskHelpAnchor.getBoundingClientRect(),box=riskTooltip.getBoundingClientRect(),edge=12;
    if(bounds.bottom<0||bounds.top>innerHeight){hideRiskHelp();return;}
    const left=Math.max(edge,Math.min(bounds.left+bounds.width/2-box.width/2,innerWidth-box.width-edge));
    let top=bounds.bottom+8;if(top+box.height>innerHeight-edge)top=bounds.top-box.height-8;
    riskTooltip.style.left=left+'px';riskTooltip.style.top=Math.max(edge,Math.min(top,innerHeight-box.height-edge))+'px';
  }
  for(const el of document.querySelectorAll('.risk-key'))addRiskHelp(el,el.classList.contains('risk-on')?-1:1,'配对指标 · 操作含义');
  document.addEventListener('pointerover',event=>{
    const anchor=event.target.closest('[data-risk-help]');
    if(anchor&&event.pointerType!=='touch')showRiskHelp(anchor);
    else if(riskTooltip.contains(event.target))clearTimeout(riskHelpTimer);
  });
  document.addEventListener('pointerout',event=>{
    const anchor=event.target.closest('[data-risk-help]');
    if((anchor&&!anchor.contains(event.relatedTarget)&&!riskTooltip.contains(event.relatedTarget))||riskTooltip.contains(event.target)&&!riskTooltip.contains(event.relatedTarget)&&!riskHelpAnchor?.contains(event.relatedTarget))deferHideRiskHelp();
  });
  document.addEventListener('focusin',event=>{const anchor=event.target.closest('[data-risk-help]');if(anchor)showRiskHelp(anchor);});
  document.addEventListener('focusout',event=>{if(event.target.closest('[data-risk-help]')&&!riskTooltip.contains(event.relatedTarget))hideRiskHelp();});
  document.addEventListener('click',event=>{
    const anchor=event.target.closest('[data-risk-help]');if(!anchor)return;
    if(riskHelpAnchor===anchor&&riskHelpPinned)hideRiskHelp();else showRiskHelp(anchor,true);
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-risk-help]')&&!riskTooltip.contains(event.target))hideRiskHelp();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')hideRiskHelp();
    const anchor=event.target.closest('[data-risk-help]');
    if(anchor&&anchor.tagName!=='BUTTON'&&['Enter',' '].includes(event.key)){event.preventDefault();anchor.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
  });
  window.addEventListener('resize',hideRiskHelp);
  document.addEventListener('scroll',event=>{if(!riskTooltip.contains(event.target))positionRiskHelp();},true);
  function updateLegend(symbol) {
    for (const button of curveButtons(symbol)) {
      const label = {fast:'30 日 · 虚线',main:params.lookback+' 日 · 实线',qqq:'QQQ 价格 · 右轴'}[button.dataset.curve];
      button.querySelector('span').textContent = label;
      button.title = (button.getAttribute('aria-pressed') === 'true' ? '隐藏 ' : '显示 ') + label;
    }
  }
  const signed = n => n === null || !Number.isFinite(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  const priceText = n => Number.isFinite(n) ? '$' + n.toFixed(2) : '—';
  const stateText = (s, symbol) => s > 0 ? symbol + ' 相对领先 · 已确认' : s < 0 ? 'QQQ 相对领先 · 已确认' : '等待方向确认';
  function showError(text) { $('error').hidden = !text; $('error').textContent = text || ''; }
  function readParams() {
    return PairMath.settings({...Object.fromEntries(['lookback', 'smoothing', 'band', 'confirmation'].map(k => [k, Number($(k).value)])),priceBasis:$('priceBasis').value,trendConfirmation:$('trendConfirmation').checked});
  }
  function validatePayload(d) {
    if (!d || d.version !== 2 || !/^\d{4}-\d{2}-\d{2}$/.test(d.asOf || '') || !d.series) throw new Error('行情格式不完整，需要包含两种收盘价的新版数据');
    for (const symbol of ['QQQ', ...symbols]) {
      const rows = d.series[symbol];
      if (!Array.isArray(rows) || rows.length < 30) throw new Error(symbol + ' 历史数据不足');
      let prior = '';
      for (const r of rows) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date <= prior || r.date > d.asOf || (r.adjClose !== null && (!(r.adjClose > 0) || !Number.isFinite(r.adjClose)))) throw new Error(symbol + ' 行情日期或价格异常');
        if (r.close !== null && (!(r.close > 0) || !Number.isFinite(r.close))) throw new Error(symbol + ' 缺少未做分红复权的收盘价');
        prior = r.date;
      }
      if (rows.at(-1).date !== d.asOf || rows.at(-1).adjClose === null || rows.at(-1).close === null) throw new Error('两端行情截止日不一致');
    }
  }
  function setData(next) {
    validatePayload(next); data = next;
    $('embeddedData').textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    $('dataStatus').textContent = '已收盘日线 · 截至 ' + data.asOf + '（美东）';
    $('fetchTime').textContent = '获取于 ' + new Date(data.fetchedAt).toLocaleString('zh-CN', {hour12:false});
    recompute();
  }
  function recompute() {
    params = params || readParams();
    $('parameterSummary').textContent = '30 日虚线 · ' + params.lookback + ' 日实线 · ' + (params.smoothing===1?'不平滑':'EMA '+params.smoothing) + ' · ' + params.confirmation + ' 日确认';
    $('dataNote').textContent = 'Yahoo Finance '+(params.priceBasis==='close'?'收盘价（含拆股调整，不做分红复权）':'分红／拆股复权收盘价')+'；仅使用完整日线。'+(isPages?'云端收盘后定时更新；页面每 5 分钟检查已发布数据。':isHosted?'打开页面时检查更新，也可手动刷新。':'当前为离线快照，不会自动更新行情。')+'历史数据修订可能改变结果。';
    for (const symbol of symbols) {
      updateLegend(symbol);
      calculated[symbol] = PairMath.calculate(data.series[symbol], data.series.QQQ, params);
      fastCalculated[symbol] = PairMath.calculate(data.series[symbol], data.series.QQQ, {...params,lookback:30});
      const last = calculated[symbol].at(-1);
      $('value-' + symbol).textContent = signed(last.value);
      $('state-' + symbol).textContent = stateText(last.state, symbol);
    }
    drawAll(); updateEvidence(); updateStrategy();
  }
  function updateStrategy() {
    const s=PairStrategy.evaluate({data,main:calculated,fast:fastCalculated,params});
    document.querySelector('.strategy-panel').dataset.mode=s.mode;
    $('strategyDate').textContent='依据 '+s.asOf+' 收盘（美东）';
    $('allocationExample').hidden=!s.weights;
    $('allocationUnavailable').hidden=Boolean(s.weights);
    const actions=[];
    if(s.mode==='risk-on') {
      $('strategyTitle').textContent=s.dipObservation?'偏进攻：出现回落加仓观察条件':'偏进攻：维持仓位，暂不追加 TQQQ';
      const fastRising=s.pairs.filter(p=>p.fastDelta>0).map(p=>p.symbol);
      const shortTerm=fastRising.length===2?'两条 30 日线较前日回升':fastRising.length?fastRising[0]+' 的 30 日线较前日回升':'30 日线未同时回升';
      $('strategyReason').textContent='四条曲线均在零线下方，两个配对的 35 日确认状态都仍偏向 QQQ。'+(s.dipObservation?'QQQ 最新交易日下跌，四条线也继续下降，可结合估值与市场环境评估分批加仓。':shortTerm+'；QQQ 最新交易日 '+signed(s.qqqDailyChange)+'。当前未满足本页的回落加仓观察条件。');
      actions.push(['已有仓位','在你已选定的风险上限内，维持 QQQ／TQQQ 的进攻配置；不因一天的曲线拐头或权重漂移，就机械调回目标比例。']);
      actions.push(['新增资金',s.dipObservation?'可评估分批向既定目标靠近，尚需核对估值、市场环境及剩余风险额度；本页没有足够信息确定本次买入金额。':'暂缓追加 TQQQ；尚未建仓时，也不因四条线低于零就一次性补齐示例比例。待回落与曲线同向后，再评估分批。']);
      actions.push(['何时转防御','30 日线回升先观察；若 35 日线向上确认、多个配对转强，优先降低 TQQQ，再考虑增加 BOXX。不要只看单日涨跌。']);
    } else if(s.mode==='risk-off') {
      $('strategyTitle').textContent='偏防御：优先降低 TQQQ 敞口';
      $('strategyReason').textContent='四条曲线均在零线上方，两个配对的 35 日确认状态均偏向防御资产。';
      $('allocationUnavailable').textContent='进攻条件已不满足，暂停 15／45／40 的配置示例。已核查视频没有给出适用于此状态的 QQQ／TQQQ／BOXX 固定比例。';
      actions.push(['调整顺序','暂停新增杠杆，优先降低 TQQQ；根据已设定的风险预算，再决定 QQQ 留仓与 BOXX 停泊比例。']);
      actions.push(['下一步','等待多个配对重新给出一致的成长优势，才重新评估进攻配置；当前不足以推导精确买卖金额。']);
    } else if(s.mode==='mixed') {
      $('strategyTitle').textContent='信号分歧：暂停新增杠杆';
      $('strategyReason').textContent='30／35 日曲线或两个配对尚未同向确认，当前不足以支持完整的进攻配置。';
      $('allocationUnavailable').textContent='暂停展示进攻目标权重。视频没有给出信号分歧时固定的三基金比例，本页不把单条曲线的拐头转换成全仓切换。';
      actions.push(['当前操作','暂停追加 TQQQ，按原定风险上限管理已有敞口，等待 35 日确认和其他配对印证。']);
    } else {
      const copy=s.mode==='custom'?['参数已修改：暂停 Bo 规则解读','恢复视频校准参数（30／35 日、无平滑、零阈值、两日同侧且延续方向、非分红复权）后，再生成对应解读。']:s.mode==='stale'?['行情日期过旧：暂停操作参考','缓存距美东当天已超过 5 个日历日；请更新行情后再查看操作与配置。']:['数据不足：暂不生成操作参考','需要同一截止日的有效 30／35 日读数、前一交易日数据与确认状态。'];
      $('strategyTitle').textContent=copy[0];$('strategyReason').textContent=copy[1];
      $('allocationUnavailable').textContent='当前不展示目标仓位，避免依据不适用的参数或数据调仓。';
    }
    const actionBox=$('strategyActions');actionBox.replaceChildren();
    for(const [label,text] of actions){const div=document.createElement('div'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=label;p.textContent=text;div.append(h,p);actionBox.append(div);}
    const body=$('strategyReadings');body.replaceChildren();
    const change=v=>(v>0?'↑ ':v<0?'↓ ':'→ ')+(Math.abs(v)).toFixed(2)+' 个百分点';
    for(const p of s.pairs){const tr=document.createElement('tr');for(const value of [p.symbol+'／QQQ',signed(p.fast)+' / '+change(p.fastDelta),signed(p.slow)+' / '+change(p.slowDelta),(p.lastSwitch||'—')+' · '+(p.state<0?'QQQ 领先':p.state>0?'防御领先':'未确认')]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
    $('strategyMarket').textContent=s.qqqDailyChange===null?'当前无可用的日涨跌数据。':'QQQ 最新交易日涨跌：'+signed(s.qqqDailyChange)+'。上表的升降比较最近两个收盘日，不能把「低于零」当作「今天仍在下降」。';
  }
  function updateEvidence() {
    const maps=Object.fromEntries(symbols.map(s=>[s,new Map(calculated[s].map(r=>[r.date,r]))]));
    const fastMaps=Object.fromEntries(symbols.map(s=>[s,new Map(fastCalculated[s].map(r=>[r.date,r]))]));
    const observations=[...evidence.numeric,...(evidence.recentNumeric||[])];
    let count=0;const body=$('numericEvidence');body.replaceChildren();
    for(const o of observations){
      const actual=(o.period===30?fastMaps:maps)[o.symbol].get(o.date)?.value ?? null, match=actual!==null && Math.abs(actual-o.value)<.00500001;
      if(match)count++;
      const tr=document.createElement('tr');
      for(const value of [o.symbol+'／QQQ · '+(o.period||35)+'日 · '+o.date,o.value.toFixed(2),actual===null?'—':actual.toFixed(4),match?'一致':'不同']){
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }body.append(tr);
    }
    const labels=[...evidence.labels,...(evidence.holdoutLabels||[]),...(evidence.recentLabels||[])];
    let matched=0;const list=$('labelDates');list.replaceChildren();
    for(const o of labels){const actual=maps[o.symbol].get(o.date),ok=actual?.changed&&actual.state===o.direction;if(ok)matched++;
      const span=document.createElement('span');span.textContent=(ok?'✓ ':'× ')+o.symbol+' '+o.date+' '+(o.direction>0?'向上':'向下');list.append(span);}
    const fastLabels=evidence.fastLabels||[];
    let fastMatched=0;
    for(const o of fastLabels){const actual=fastMaps[o.symbol].get(o.date),ok=actual?.changed&&actual.state===o.direction;if(ok)fastMatched++;
      const span=document.createElement('span');span.textContent=(ok?'✓ ':'× ')+o.symbol+' 30 日 '+o.date+' '+riskName(o.direction);list.append(span);}
    $('verificationSummary').textContent=count+'/'+observations.length+' 读数 · 35 日 '+matched+'/'+labels.length+' · 30 日 '+fastMatched+'/'+fastLabels.length+' 标签匹配';
    $('labelEvidence').textContent='35 日确认信号：'+matched+'/'+labels.length+' 个日期及方向匹配。30 日新增核对：'+fastMatched+'/'+fastLabels.length+'，来自你指定视频中 VTV 的 2026-03-20 Risk On、03-30 Risk Off。该画面的 35 日 04-02 Risk On、06-25 Risk Off 也一致，已在原有 23 个日期内，不重复计数。被遮挡的日期没有计入验证；30 日标签只完成这两个样本的检查。';
  }
  function svgNode(tag, attrs = {}, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function niceStep(span) {
    const raw = span / 5, base = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map(v => v * base).find(v => v >= raw) || base * 10;
  }
  function drawRiskSignals(symbol, svg, group, events, x, y, margin, iw, ih) {
    const showLabels=riskButton(symbol).getAttribute('aria-pressed')==='true';
    riskButton(symbol).textContent='信号标签：'+(showLabels?'开':'关');
    const layer=svgNode('g',{'data-risk-label-layer':symbol,'pointer-events':'none'}),boxes=[];
    const width=Math.min(92,iw),height=32,gap=5;
    let displayed=0;
    // Prefer the main curve and recent transitions when a long window is crowded.
    const ordered=[...events].sort((a,b)=>(a.curve==='main'?0:1)-(b.curve==='main'?0:1)||b.row.date.localeCompare(a.row.date));
    for(const event of ordered){
      const {row,curve,period,index}=event,cx=x(index),cy=y(row.value),tone=riskClass(row.state);
      const attrs={class:'risk-marker '+tone,fill:'var(--risk-color)',stroke:'var(--surface)','stroke-width':1.4,'data-confirmation':symbol,'data-signal-curve':curve,'data-signal-date':row.date,'data-risk-state':riskName(row.state)};
      const marker=curve==='fast'?svgNode('path',{...attrs,d:`M${cx},${cy-4.5}l4.5,4.5l-4.5,4.5l-4.5,-4.5Z`}):svgNode('circle',{...attrs,cx,cy,r:3.8});
      marker.append(svgNode('title',{},`${period} 日 ${riskName(row.state)} · ${row.date}`));group.append(marker);
      if(!showLabels)continue;
      const left=Math.max(margin.left,Math.min(cx-width/2,margin.left+iw-width));
      const preferred=row.state<0?-1:1,candidates=[];
      for(const side of [preferred,-preferred])for(let lane=0;lane<5;lane++){
        const top=side<0?cy-10-height-lane*(height+gap):cy+10+lane*(height+gap);
        if(top>=margin.top&&top+height<=margin.top+ih)candidates.push({left,top});
      }
      const box=candidates.find(b=>boxes.every(a=>b.left+width+gap<=a.left||a.left+width+gap<=b.left||b.top+height+gap<=a.top||a.top+height+gap<=b.top));
      if(!box)continue;
      boxes.push(box);displayed++;
      const label=svgNode('g',{class:'risk-label '+tone+(curve==='fast'?' risk-fast':''),'data-risk-label':curve,'data-signal-date':row.date,'data-risk-state':riskName(row.state)});
      const edgeY=box.top>cy?box.top:box.top+height;
      label.append(svgNode('line',{x1:cx,y1:cy,x2:Math.max(box.left+6,Math.min(cx,box.left+width-6)),y2:edgeY,stroke:'var(--risk-color)','stroke-width':1,opacity:.65}));
      label.append(svgNode('rect',{x:box.left,y:box.top,width,height,rx:5}));
      label.append(svgNode('text',{x:box.left+width/2,y:box.top+12,'text-anchor':'middle',class:'risk-label-name'},riskName(row.state)));
      label.append(svgNode('text',{x:box.left+width/2,y:box.top+25,'text-anchor':'middle',class:'risk-label-date'},period+'日 · '+row.date.slice(5)));
      addRiskHelp(label,row.state,symbol+'／QQQ · '+period+' 日'+(curve==='fast'?'虚线':'实线')+' · '+row.date+' 切换');
      layer.append(label);
    }
    svg.append(layer);
    const note=$('signalNote-'+symbol),hidden=events.length-displayed;
    note.hidden=!(showLabels&&hidden>0);
    note.textContent=hidden+' 个标签因空间不足收起，切换点仍保留；可缩短区间或展开信号列表。';
    const list=$('signalList-'+symbol);list.replaceChildren();
    $('signalSummary-'+symbol).textContent='区间信号列表 · '+events.length+' 次切换';
    if(!events.length){const p=document.createElement('p');p.textContent='本区间内，已显示的指标曲线没有新的确认切换。';list.append(p);}
    for(const {row,curve,period} of [...events].sort((a,b)=>b.row.date.localeCompare(a.row.date)||b.period-a.period)){
      const item=document.createElement('div');item.className='signal-item';item.dataset.signalCurve=curve;item.dataset.signalDate=row.date;
      const date=document.createElement('span');date.textContent=row.date;
      const line=document.createElement('span');line.textContent=period+' 日'+(curve==='fast'?'虚线':'实线');
      const badge=document.createElement('b');badge.className=riskClass(row.state);badge.textContent=riskName(row.state);
      addRiskHelp(badge,row.state,symbol+'／QQQ · '+period+' 日 · '+row.date+' 切换');
      item.append(date,line,badge);list.append(item);
    }
  }
  function updateRiskStatus(symbol, date, shown) {
    const status=$('signalStatus-'+symbol);status.replaceChildren();
    if(!shown.fast&&!shown.main)return;
    const heading=document.createElement('span');heading.className='signal-asof';heading.textContent=date+' 收盘状态';status.append(heading);
    for(const curve of ['fast','main']){
      if(!shown[curve])continue;
      const series=curve==='fast'?fastCalculated[symbol]:calculated[symbol],past=series.filter(r=>r.date<=date),row=past.at(-1);
      const change=row?.state?past.findLast(r=>r.changed&&r.state===row.state):null;
      const chip=document.createElement('span');chip.className='signal-state '+riskClass(row?.state||0);chip.dataset.stateCurve=curve;
      const strong=document.createElement('b');strong.textContent=(curve==='fast'?'30 日虚线':params.lookback+' 日实线')+' · '+riskName(row?.state||0);
      chip.append(strong,document.createTextNode(change?'自 '+change.date+' 确认后延续':'等待确认'));status.append(chip);
      addRiskHelp(chip,row?.state,symbol+'／QQQ · '+(curve==='fast'?30:params.lookback)+' 日 · '+date+' 收盘状态');
    }
  }
  function draw(symbol) {
    if(riskHelpAnchor?.closest('[data-symbol="'+symbol+'"]'))hideRiskHelp();
    const container = $('chart-' + symbol);
    const shown = visibleCurves(symbol);
    const window = range==='video'?['2025-05-01','2026-07-24']:range==='holdout'?['2022-07-01','2023-05-01']:null;
    const rows = window?calculated[symbol].filter(r=>r.date>=window[0]&&r.date<=window[1]):range?calculated[symbol].slice(-range):calculated[symbol];
    const fastMap=new Map(fastCalculated[symbol].map(r=>[r.date,r]));
    const fastRows=rows.map(r=>fastMap.get(r.date));
    const qqqMap=new Map(data.series.QQQ.map(r=>[r.date,r.close]));
    const qqqRows=rows.map(r=>qqqMap.get(r.date)??null);
    const hasPair=shown.fast||shown.main;
    const prices=qqqRows.filter(Number.isFinite),hasPrice=shown.qqq&&prices.length>0;
    const last=rows.at(-1);$('value-'+symbol).textContent=signed(last?.value);$('state-'+symbol).textContent=last?params.lookback+' 日 · '+stateText(last.state,symbol):'该区间无数据';
    $('windowStatus').textContent=window?'当前显示：'+window[0]+' 至 '+window[1]+' · 视频历史对照':'当前显示：'+(rows[0]?.date||'—')+' 至 '+(last?.date||'—')+' · '+(range?'最近 '+rows.length+' 个交易日':'全部已收盘日线');
    $('strategyWindow').hidden=!window;
    $('strategyWindow').textContent=window?'下方曲线正在显示历史区间；本栏仍依据 '+data.asOf+' 最新收盘数据，不是当时的操作建议。':'';
    const w = Math.max(220, container.clientWidth), h = container.clientHeight;
    const margin = {left:52, right:hasPrice?56:12, top:22, bottom:36};
    const iw = w - margin.left - margin.right, ih = h - margin.top - margin.bottom;
    const values = [...(shown.main?rows:[]),...(shown.fast?fastRows:[])].filter(r => r.value !== null).map(r => r.value);
    const lo = Math.min(-params.band, 0, ...values), hi = Math.max(params.band, 0, ...values);
    const pad = Math.max((hi-lo)*.12, .2), step = niceStep(hi-lo+2*pad);
    const ymin = Math.floor((lo-pad)/step)*step, ymax = Math.ceil((hi+pad)/step)*step;
    const x = i => margin.left + (rows.length > 1 ? i / (rows.length-1) : .5) * iw;
    const y = v => margin.top + (ymax-v)/(ymax-ymin)*ih;
    const priceLow=hasPrice?Math.min(...prices):0,priceHigh=hasPrice?Math.max(...prices):1;
    const pricePad=Math.max((priceHigh-priceLow)*.12,priceLow*.002,.01);
    const priceStep=niceStep(priceHigh-priceLow+2*pricePad);
    const priceMin=Math.max(0,Math.floor((priceLow-pricePad)/priceStep)*priceStep);
    const priceMax=Math.ceil((priceHigh+pricePad)/priceStep)*priceStep;
    const priceY=v=>margin.top+(priceMax-v)/(priceMax-priceMin)*ih;
    const color = 'var(--' + symbol.toLowerCase() + ')';
    const seriesLabel = [shown.fast?'30 日虚线（左轴 %）':'',shown.main?params.lookback+' 日实线（左轴 %）':'',shown.qqq?'青蓝 QQQ 收盘价（右轴美元）':''].filter(Boolean).join('；') || '曲线均已隐藏';
    const svg = svgNode('svg', {viewBox:`0 0 ${w} ${h}`,role:'group','aria-label':`${symbol} 与 QQQ：${seriesLabel}；左右方向键查看交易日`,tabindex:'0'});
    svg.append(svgNode('title', {}, symbol + ' / QQQ 相对 ROC'));
    const defs = svgNode('defs'), clip = svgNode('clipPath', {id:'clip-'+symbol});
    clip.append(svgNode('rect',{x:margin.left-6,y:margin.top,width:iw+12,height:ih})); defs.append(clip); svg.append(defs);
    if(hasPair)svg.append(svgNode('rect',{x:margin.left,y:y(params.band),width:iw,height:y(-params.band)-y(params.band),fill:'var(--band)'}));
    const precision = step < 1 ? 1 : 0;
    if(hasPair)for (let v = ymin; v <= ymax + step * .01; v += step) {
      const zero = Math.abs(v) < step * .001;
      svg.append(svgNode('line',{x1:margin.left,x2:w-margin.right,y1:y(v),y2:y(v),stroke:zero?'var(--muted)':'var(--grid)','stroke-width':zero?1.1:.8}));
      svg.append(svgNode('text',{x:margin.left-9,y:y(v)+4,'text-anchor':'end',class:zero?'zero-text':''},(Math.abs(v)<1e-8?0:v).toFixed(precision)));
    }
    if(hasPair)svg.append(svgNode('text',{x:margin.left,y:12},'相对 ROC（%）'));
    if(hasPrice){
      const axis=svgNode('g',{'data-price-axis':symbol});
      axis.append(svgNode('text',{x:w-2,y:12,'text-anchor':'end',class:'qqq-axis'},'QQQ（美元）'));
      axis.append(svgNode('line',{x1:w-margin.right,x2:w-margin.right,y1:margin.top,y2:margin.top+ih,stroke:'var(--qqq-line)',opacity:.5}));
      for(let v=priceMin;v<=priceMax+priceStep*.01;v+=priceStep){
        if(!hasPair)axis.append(svgNode('line',{x1:margin.left,x2:w-margin.right,y1:priceY(v),y2:priceY(v),stroke:'var(--grid)','stroke-width':.8}));
        axis.append(svgNode('line',{x1:w-margin.right,x2:w-margin.right+4,y1:priceY(v),y2:priceY(v),stroke:'var(--qqq-line)'}));
        axis.append(svgNode('text',{x:w-margin.right+8,y:priceY(v)+4,class:'qqq-axis'},v.toFixed(Number.isInteger(priceStep)?0:priceStep<.1?2:1)));
      }
      svg.append(axis);
    }
    const ticks = Math.min(rows.length, w < 500 ? 3 : 6);
    for (let n = 0; n < ticks; n++) {
      const i = ticks===1?0:Math.round(n * (rows.length-1) / (ticks-1));
      if (i < 0 || !rows[i]) continue;
      const label = rows.length<=63?rows[i].date.slice(5):rows[i].date.slice(0,7);
      svg.append(svgNode('text',{x:x(i),y:h-15,'text-anchor':n===0?'start':n===ticks-1?'end':'middle'},label));
    }
    const g = svgNode('g',{'clip-path':'url(#clip-'+symbol+')'});
    if(hasPrice){
      let pricePath='',priceConnected=false;
      qqqRows.forEach((value,i)=>{if(!Number.isFinite(value)){priceConnected=false;return;}pricePath+=(priceConnected?'L':'M')+x(i).toFixed(2)+','+priceY(value).toFixed(2);priceConnected=true;});
      g.append(svgNode('path',{d:pricePath,fill:'none',stroke:'var(--qqq-line)','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.9,'data-qqq-series':symbol}));
    }
    let fastPath='',fastConnected=false;
    fastRows.forEach((r,i)=>{if(r.value===null){fastConnected=false;return;}fastPath+=(fastConnected?'L':'M')+x(i).toFixed(2)+','+y(r.value).toFixed(2);fastConnected=true;});
    if(shown.fast)g.append(svgNode('path',{d:fastPath,fill:'none',stroke:color,'stroke-width':1.5,'stroke-dasharray':'5 4',opacity:.8,'data-fast-series':symbol}));
    let path = '', connected = false;
    rows.forEach((r,i) => {
      if (r.value === null) {connected=false;return;}
      path += (connected?'L':'M') + x(i).toFixed(2)+','+y(r.value).toFixed(2); connected=true;
    });
    if(shown.main)g.append(svgNode('path',{d:path,fill:'none',stroke:color,'stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round','data-series':symbol}));
    if(window)for(const o of [...evidence.numeric,...(evidence.recentNumeric||[])].filter(o=>o.symbol===symbol)){
      if(!shown[o.period===30?'fast':'main'])continue;
      const i=rows.findIndex(r=>r.date===o.date);if(i<0)continue;
      const ref=svgNode('circle',{cx:x(i),cy:y(o.value),r:5,fill:'var(--surface)',stroke:'var(--fg)','stroke-width':1.4,'data-reference-period':o.period||35});
      ref.append(svgNode('title',{},'视频原值 '+o.date+' '+o.value.toFixed(2)));g.append(ref);
    }
    svg.append(g);
    const events=[];
    for(const [curve,period,series] of [['main',params.lookback,rows],['fast',30,fastRows]])if(shown[curve])series.forEach((row,index)=>{if(row.changed&&row.value!==null)events.push({row,index,curve,period});});
    drawRiskSignals(symbol,svg,g,events,x,y,margin,iw,ih);
    if(!hasPair&&!hasPrice)svg.append(svgNode('text',{x:margin.left+iw/2,y:margin.top+ih/2,'text-anchor':'middle',class:'empty-message'},shown.qqq?'所选区间暂无 QQQ 收盘价':'点击上方图例显示曲线'));
    const guide = svgNode('line',{x1:0,x2:0,y1:margin.top,y2:h-margin.bottom,stroke:'var(--muted)','stroke-width':1,'stroke-dasharray':'3 4',visibility:'hidden'});
    const dot = svgNode('circle',{r:4,fill:color,stroke:'var(--surface)','stroke-width':2,visibility:'hidden'});
    const qqqDot=svgNode('circle',{r:3.5,fill:'var(--qqq-line)',stroke:'var(--surface)','stroke-width':1.5,visibility:'hidden','data-qqq-cursor':symbol});
    svg.append(guide,qqqDot,dot);
    const target = svgNode('rect',{x:margin.left,y:margin.top,width:iw,height:ih,fill:'transparent','data-chart-hit':'true'}); svg.append(target);
    // Keep interactive signal labels above the transparent chart inspection surface.
    svg.append(svg.querySelector('[data-risk-label-layer]'));
    function inspect(event) {
      const bounds = svg.getBoundingClientRect();
      const i = Math.max(0,Math.min(rows.length-1,Math.round(((event.clientX-bounds.left)-margin.left)/iw*(rows.length-1))));
      selected = rows[i]?.date; updateDetails();
    }
    target.addEventListener('pointermove', e => {if(e.pointerType==='mouse' || e.buttons) inspect(e);});
    target.addEventListener('pointerdown', inspect);
    svg.addEventListener('pointerleave', e => {if(e.pointerType==='mouse') {selected=null;updateDetails();}});
    svg.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key)) return;
      e.preventDefault();
      let i = rows.findIndex(r=>r.date===selected); if(i<0)i=rows.length-1;
      if(e.key==='Escape')selected=null;
      else {i=e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowLeft'?-1:1)));selected=rows[i].date;}
      updateDetails();
    });
    container.replaceChildren(svg); plots[symbol]={rows,fastRows,qqqRows,x,y,priceY,guide,dot,qqqDot,shown};
  }
  function updateDetails() {
    for (const symbol of symbols) {
      const p=plots[symbol]; if(!p)continue;
      let i=selected?p.rows.findIndex(r=>r.date===selected):p.rows.length-1;
      if(i<0)i=p.rows.length-1;
      const r=p.rows[i], detail=$('detail-'+symbol); detail.replaceChildren();
      if(!r)continue;
      updateRiskStatus(symbol,r.date,p.shown);
      const entries=[['',r.date]];
      if(p.shown.qqq)entries.push(['QQQ 收盘价',priceText(p.qqqRows[i])]);
      if(p.shown.fast)entries.push(['30日虚线',signed(p.fastRows[i].value)]);
      if(p.shown.main)entries.push([params.lookback+'日实线',signed(r.value)],[symbol+' '+params.lookback+'日涨跌',signed(r.rocA)],['QQQ '+params.lookback+'日涨跌',signed(r.rocB)]);
      for (const [label,value] of entries) {
        const span=document.createElement('span');span.textContent=label?label+' ':'';
        const b=document.createElement('b');b.textContent=value;span.append(b);detail.append(span);
      }
      const pointValue=p.shown.main?r.value:p.shown.fast?p.fastRows[i].value:null;
      const visible=selected&&pointValue!==null;
      const priceVisible=selected&&p.shown.qqq&&Number.isFinite(p.qqqRows[i]);
      p.guide.setAttribute('visibility',visible||priceVisible?'visible':'hidden');p.dot.setAttribute('visibility',visible?'visible':'hidden');
      p.qqqDot.setAttribute('visibility',priceVisible?'visible':'hidden');
      if(visible||priceVisible){p.guide.setAttribute('x1',p.x(i));p.guide.setAttribute('x2',p.x(i));}
      if(visible){p.dot.setAttribute('cx',p.x(i));p.dot.setAttribute('cy',p.y(pointValue));}
      if(priceVisible){p.qqqDot.setAttribute('cx',p.x(i));p.qqqDot.setAttribute('cy',p.priceY(p.qqqRows[i]));}
    }
  }
  function drawAll(){for(const s of symbols)draw(s);updateDetails();}
  async function refresh(force=false) {
    if(!isHosted){showError('这是离线快照。双击配套的“打开配对指标.command”可打开支持更新的版本。');return;}
    const button=$('refresh');button.disabled=true;button.textContent='更新中…';showError('');
    document.dispatchEvent(new Event('bond-refresh'));
    try {
      const endpoint=isPages?'data.json?check='+Date.now():'/api/data'+(force?'?refresh=1':'');
      const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(35000)});
      const payload=await response.json();
      if(!response.ok || !payload.data)throw new Error(payload.error||'无法获取行情');
      setData(payload.data);if(payload.warning)showError(payload.warning+' 当前保留截至 '+data.asOf+' 的缓存。');
    } catch(e){showError('行情未更新：'+e.message+'。当前仍显示截至 '+data.asOf+' 的缓存。');}
    finally{button.disabled=false;button.innerHTML=(isPages?'检查更新':'更新行情')+' <span aria-hidden="true">↻</span>';}
  }
  $('refresh').addEventListener('click',()=>refresh(true));
  for(const symbol of symbols)for(const button of curveButtons(symbol))button.addEventListener('click',()=>{
    button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));
    updateLegend(symbol);draw(symbol);updateDetails();
  });
  for(const symbol of symbols)riskButton(symbol).addEventListener('click',()=>{
    const button=riskButton(symbol);button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));draw(symbol);updateDetails();
  });
  function setRange(value){range=['video','holdout'].includes(value)?value:Number(value);document.documentElement.dataset.pairRange=String(range);selected=null;document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range===String(range))));drawAll();}
  document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>setRange(button.dataset.range)));
  $('showReference').addEventListener('click',()=>{setRange('video');document.querySelector('.toolbar').scrollIntoView({block:'start'});});
  $('showHoldout').addEventListener('click',()=>{setRange('holdout');document.querySelector('.toolbar').scrollIntoView({block:'start'});});
  $('settingsForm').addEventListener('submit',e=>{e.preventDefault();try{params=readParams();showError('');recompute();}catch(err){showError(err.message);}});
  $('reset').addEventListener('click',()=>{params=PairMath.settings();for(const [k,v]of Object.entries(params)){if(k==='trendConfirmation')$(k).checked=v;else $(k).value=v;}showError('');recompute();});
  $('download').addEventListener('click',()=>{
    hideRiskHelp();
    const clone=document.documentElement.cloneNode(true);
    for(const k of ['lookback','smoothing','band','confirmation'])clone.querySelector('#'+k).setAttribute('value',params[k]);
    clone.querySelectorAll('#priceBasis option').forEach(o=>o.toggleAttribute('selected',o.value===params.priceBasis));
    clone.querySelector('#trendConfirmation').toggleAttribute('checked',params.trendConfirmation);
    clone.querySelector('#refresh').disabled=false;
    const blob=new Blob(['<!doctype html>\n'+clone.outerHTML],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='配对观察-'+data.asOf+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  try {
    const active=document.querySelector('[data-range][aria-pressed="true"]'),savedRange=document.documentElement.dataset.pairRange || active?.dataset.range || '126';
    range=['video','holdout'].includes(savedRange)?savedRange:Number(savedRange);
    setData(JSON.parse($('embeddedData').textContent));
    if(isPages){
      $('cloudUpdateNote').hidden=false;
      $('cloudUpdateNote').textContent='云端每个工作日美东 16:37 更新、18:17 补查。页面打开时及每 5 分钟检查最新发布数据；定时任务可能延迟。';
      $('refresh').title='读取云端最新已发布的收盘数据';
      setInterval(()=>{if(!document.hidden&&!$('refresh').disabled)refresh(false);},300000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('refresh').disabled)refresh(false);});
    }
    const observer=new ResizeObserver(()=>drawAll());symbols.forEach(s=>observer.observe($('chart-'+s)));
    if(isHosted)refresh(false);else $('refresh').textContent='离线快照';
  } catch(e){showError('图表无法加载：'+e.message);$('dataStatus').textContent='数据不可用';}
})();
