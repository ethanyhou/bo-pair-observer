(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fields = ['expectedReal', 'inflation', 'realPremium', 'inflationPremium', 'nominal'];
  const meanings = {
    expectedReal: {name:'实际利率预期', up:'Bo 解读为增长与资本需求可能较强；同时较高实际利率会增加融资成本和科技股估值压力。', down:'可能来自增长、资本需求或政策预期转弱；若降得比通胀因素更快，Bo 提醒警惕美股盈利风险。'},
    inflation: {name:'通胀预期', up:'预期物价涨幅增加，可能抬高名义利率、延后宽松，对成长股估值形成压力。', down:'实际增长预期稳定时，可能缓解政策与折现率压力；仅此一项下降不能保证股票上涨。'},
    realPremium: {name:'实际利率风险溢价', up:'投资者要求更多补偿以承担未来实际利率不确定性，可能推高融资和折现成本；不能直接当作增长更强。', down:'利率不确定性的补偿减少，可能减轻估值压力；仍需区分风险缓解与增长走弱。'},
    inflationPremium: {name:'通胀风险溢价', up:'投资者要求更多补偿以承担通胀不确定性，可能增加股债定价压力。', down:'通胀风险补偿减少，可能有利于估值；仍需同时观察实际利率预期。'},
    nominal: {name:'模型合成名义收益率'}
  };
  const month = date => date.slice(0,7);
  const percent = value => Number.isFinite(value) ? value.toFixed(2)+'%' : '—';
  const pp = value => (value>0?'+':'')+value.toFixed(2)+' 个百分点';
  let data, warning, range='video', selected, plot, refreshing=false;
  const toggles = [...document.querySelectorAll('[data-bond-series]')];
  const shown = () => fields.filter(k=>toggles.find(b=>b.dataset.bondSeries===k).getAttribute('aria-pressed')==='true');

  function validate(next) {
    if(next?.version!==1 || next.frequency!=='monthly' || !Array.isArray(next.rows) || next.rows.length<12)throw new Error('月度模型数据不完整');
    let prior='';
    for(const row of next.rows){
      if(!/^\d{4}-\d{2}-01$/.test(row.date) || row.date<=prior || row.date>next.asOf || fields.some(k=>!Number.isFinite(row[k])||Math.abs(row[k])>30))throw new Error('月度模型日期或数值异常');
      if(Math.abs(fields.slice(0,4).reduce((sum,k)=>sum+row[k],0)-row.nominal)>1e-8)throw new Error('模型分解之和不一致');
      prior=row.date;
    }
    if(prior!==next.asOf)throw new Error('模型截止月份不一致');
  }

  function setData(payload) {
    validate(payload.data);
    if(data && payload.data.asOf<data.asOf)throw new Error('发布的模型月份早于已有缓存');
    data=payload.data;warning=payload.warning||null;
    $('embeddedBondData').textContent=JSON.stringify(payload).replace(/</g,'\\u003c');
    $('bondNominal').textContent=percent(data.rows.at(-1).nominal);
    const publication=data.lastPublishedAt?'官方发布 '+data.lastPublishedAt:'官方发布日期未提供';
    $('bondDataStatus').textContent='模型月份 '+month(data.asOf)+' · '+publication+(data.nextUpdate?' · 预计下次 '+data.nextUpdate:'')+' · 按月发布，非盘中行情';
    showWarning();
    if(!selected || !data.rows.some(r=>r.date===selected))selected=data.asOf;
    draw();updateSummary();
  }

  function showWarning(extra) {
    const today=new Date().toISOString().slice(0,10), notes=[warning,extra].filter(Boolean);
    const age=(Date.parse(today)-Date.parse(data.asOf))/86400000;
    if(data.nextUpdate && today>data.nextUpdate)notes.push('已超过官方列出的预计下次发布日期；当前仍显示 '+month(data.asOf)+' 模型，请核对官方是否已更新。');
    else if(age>62)notes.push('模型月份距今已超过两个月，近期背景判断应先核对官方新数据。');
    $('bondWarning').hidden=!notes.length;$('bondWarning').textContent=notes.join(' ');
  }

  function windowRows() {
    return range==='video'?data.rows.filter(r=>r.date>='2026-04-01'):Number(range)>0?data.rows.slice(-Number(range)):data.rows;
  }

  function node(tag, attrs={}, text) {
    const element=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value] of Object.entries(attrs))element.setAttribute(key,value);
    if(text!==undefined)element.textContent=text;
    return element;
  }

  function scale(values, zero) {
    let min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*.12,.12);
    min=zero?Math.min(0,min-pad):min-pad;max+=pad;
    const raw=(max-min)/5,base=10**Math.floor(Math.log10(raw));
    const step=[1,2,2.5,5,10].map(v=>v*base).find(v=>v>=raw);
    return {min:Math.floor(min/step)*step,max:Math.ceil(max/step)*step,step};
  }

  function draw() {
    if(!data)return;
    const rows=windowRows(), visible=shown(), box=$('bondChart');
    box.replaceChildren();
    if(!rows.length){box.textContent='该区间没有月度模型数据。';return;}
    if(!rows.some(r=>r.date===selected))selected=rows.at(-1).date;
    $('bondWindow').textContent=month(rows[0].date)+' — '+month(rows.at(-1).date)+' · '+rows.length+' 个月度点';
    $('bondMonth').replaceChildren();
    for(const row of rows){const option=document.createElement('option');option.value=row.date;option.textContent=month(row.date);option.selected=row.date===selected;$('bondMonth').append(option);}
    const w=Math.max(280,box.clientWidth),h=box.clientHeight,margin={left:48,right:48,top:26,bottom:30},iw=w-margin.left-margin.right,ih=h-margin.top-margin.bottom;
    const svg=node('svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-label':`十年美债收益率月度分解，${month(rows[0].date)}至${month(rows.at(-1).date)}，四项左轴，合成名义收益率右轴。可用下方月份选择器读取数值。`});
    box.append(svg);
    const start=Date.parse(rows[0].date),end=Date.parse(rows.at(-1).date);
    const x=date=>margin.left+(end===start?iw/2:(Date.parse(date)-start)/(end-start)*iw);
    const components=visible.filter(k=>k!=='nominal');
    const left=scale(rows.flatMap(r=>(components.length?components:fields.slice(0,4)).map(k=>r[k])),true);
    const right=scale(rows.map(r=>r.nominal),false);
    const y=(value,axis)=>margin.top+(axis.max-value)/(axis.max-axis.min)*ih;
    const leftY=value=>y(value,left),rightY=value=>y(value,right);
    for(let tick=left.min;tick<=left.max+left.step*.01;tick+=left.step){
      if(components.length)svg.append(node('line',{x1:margin.left,x2:margin.left+iw,y1:leftY(tick),y2:leftY(tick),stroke:'var(--grid)'}),node('text',{x:margin.left-8,y:leftY(tick)+4,'text-anchor':'end'},tick.toFixed(1)));
    }
    if(components.length)svg.append(node('text',{x:margin.left,y:14,'text-anchor':'start'},'分解 · %'));
    if(visible.includes('nominal')){
      for(let tick=right.min;tick<=right.max+right.step*.01;tick+=right.step)svg.append(node('text',{x:w-margin.right+8,y:rightY(tick)+4,class:'bond-nominal-axis'},tick.toFixed(1)));
      svg.append(node('text',{x:w-margin.right,y:14,'text-anchor':'end',class:'bond-nominal-axis'},'合成 · %'));
    }
    const labelCount=w<500?4:7,labelIndices=new Set([0,rows.length-1]);
    for(let i=0;i<rows.length;i+=Math.max(1,Math.ceil(rows.length/(labelCount-1)))){
      if(i<rows.length-1 && i>rows.length-1-Math.ceil(rows.length/(labelCount-1)))continue;
      labelIndices.add(i);
    }
    for(const i of [...labelIndices].sort((a,b)=>a-b))svg.append(node('text',{x:x(rows[i].date),y:h-7,'text-anchor':i===0?'start':i===rows.length-1?'end':'middle'},month(rows[i].date)));
    for(const field of visible){
      const attrs={class:'bond-line bond-'+field,'data-bond-line':field,fill:'none',stroke:`var(--bond-${field})`,'stroke-width':field==='nominal'?2.8:2.1,'stroke-linejoin':'round','stroke-linecap':'round'};
      if(field.endsWith('Premium'))attrs['stroke-dasharray']='6 5';
      const fy=field==='nominal'?rightY:leftY;
      svg.append(node('path',{...attrs,d:rows.map((r,i)=>(i?'L':'M')+x(r.date)+','+fy(r[field])).join(' ')}));
      if(rows.length<=12)for(const row of rows)svg.append(node('circle',{cx:x(row.date),cy:fy(row[field]),r:2,fill:`var(--bond-${field})`}));
    }
    if(!visible.length)svg.append(node('text',{x:w/2,y:h/2,'text-anchor':'middle',class:'empty-message'},'请选择至少一条曲线'));
    const guide=node('line',{y1:margin.top,y2:margin.top+ih,stroke:'var(--muted)','stroke-dasharray':'3 3',opacity:.6});svg.append(guide);
    const dots={};for(const field of visible){dots[field]=node('circle',{r:4,fill:`var(--bond-${field})`,stroke:'var(--surface)','stroke-width':1.5});svg.append(dots[field]);}
    const overlay=node('rect',{x:margin.left,y:margin.top,width:iw,height:ih,fill:'transparent'});svg.append(overlay);
    plot={rows,x,leftY,rightY,guide,dots,visible};
    function pick(event){
      const rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)*w/rect.width;
      const row=rows.reduce((best,r)=>Math.abs(x(r.date)-px)<Math.abs(x(best.date)-px)?r:best,rows[0]);
      selected=row.date;updateSelection();
    }
    overlay.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')pick(event);});
    overlay.addEventListener('pointerdown',pick);
    updateSelection();updatePeriod();
  }

  function updateSelection() {
    if(!plot)return;
    const row=plot.rows.find(r=>r.date===selected)||plot.rows.at(-1),allIndex=data.rows.findIndex(r=>r.date===row.date),previous=data.rows[allIndex-1];
    $('bondMonth').value=row.date;
    plot.guide.setAttribute('x1',plot.x(row.date));plot.guide.setAttribute('x2',plot.x(row.date));plot.guide.setAttribute('visibility',plot.visible.length?'visible':'hidden');
    for(const [field,dot] of Object.entries(plot.dots)){dot.setAttribute('cx',plot.x(row.date));dot.setAttribute('cy',(field==='nominal'?plot.rightY:plot.leftY)(row[field]));}
    const detail=$('bondDetail');detail.replaceChildren();
    for(const [label,value] of [['模型月份',month(row.date)],...plot.visible.map(k=>[meanings[k].name,percent(row[k])])]){
      const span=document.createElement('span'),b=document.createElement('b');span.textContent=label+' ';b.textContent=value;span.append(b);detail.append(span);
    }
    const readings=$('bondCurveReadings');readings.replaceChildren();
    for(const field of fields.slice(0,4)){
      const definition=meanings[field],card=document.createElement('article');card.className='bond-curve-card';card.dataset.bondCard=field;
      const heading=document.createElement('h4'),key=document.createElement('i');key.className='legend-line'+(field.endsWith('Premium')?' dashed':'');heading.append(key,document.createTextNode(definition.name));
      const metric=document.createElement('p');metric.className='bond-card-metric';
      const value=document.createElement('strong');value.textContent=percent(row[field]);
      const change=document.createElement('span');change.textContent=month(row.date)+(previous?' · 较 '+month(previous.date)+' '+pp(row[field]-previous[field]):' · 无前月数据');metric.append(value,change);
      card.append(heading,metric);
      for(const [label,text] of [['上行时',definition.up],['下行时',definition.down]]){const p=document.createElement('p'),b=document.createElement('b');b.textContent=label+'：';p.append(b,document.createTextNode(text));card.append(p);}
      readings.append(card);
    }
  }

  function updateSummary() {
    const current=data.rows.at(-1),previous=data.rows.at(-2),delta=k=>current[k]-previous[k];
    const inflationDelta=delta('inflation')+delta('inflationPremium');
    $('bondSummaryTitle').textContent='最新月度变化 · '+month(current.date)+' 对比 '+month(previous.date);
    let interpretation;
    if(delta('nominal')>0){
      interpretation=delta('expectedReal')<0?'收益率上行与实际利率预期回落同时出现；需区分增长预期转弱和通胀／风险补偿上升。':'按 Bo 的思路，实际利率预期上升可以与增长较强并存；通胀和风险溢价上行仍可能增加估值压力。';
    }else if(delta('nominal')<0){
      interpretation=delta('expectedReal')<0 && -delta('expectedReal')>Math.max(0,-inflationDelta)?'实际利率预期的降幅超过通胀因素的降幅，符合 Bo 提醒应关注的增长风险情景；不能自动把收益率下降当作美股利好。':inflationDelta<0?'通胀因素回落；若实际增长预期稳定，按 Bo 的思路可能缓解美股定价压力。':'收益率下降主要需结合风险溢价变化解释，单看合成线不能判断美股方向。';
    }else interpretation='模型收益率基本不变，仍需观察内部驱动项的变化。';
    $('bondSummary').textContent='模型名义收益率 '+pp(delta('nominal'))+'；实际利率预期 '+pp(delta('expectedReal'))+'，通胀因素（预期＋风险溢价）合计 '+pp(inflationDelta)+'，实际利率风险溢价 '+pp(delta('realPremium'))+'。'+interpretation+' 这是月度背景解读，不是 QQQ／TQQQ 的买卖或仓位指令。';
  }

  function updatePeriod() {
    const first=plot.rows[0],last=plot.rows.at(-1),delta=k=>last[k]-first[k];
    $('bondPeriodChange').textContent=first===last?'本区间只有一个月度点，无法比较区间变化。':'所选区间 '+month(first.date)+' → '+month(last.date)+'：名义收益率 '+pp(delta('nominal'))+'；实际利率预期 '+pp(delta('expectedReal'))+'；通胀因素合计 '+pp(delta('inflation')+delta('inflationPremium'))+'；实际利率风险溢价 '+pp(delta('realPremium'))+'。';
  }

  async function refresh() {
    if(refreshing || !/^https?:$/.test(location.protocol))return;
    refreshing=true;
    try{
      const response=await fetch('bond-data.json?check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(35000)});
      if(!response.ok)throw new Error('云端月度模型暂不可用');
      setData(await response.json());
    }catch(error){showWarning('本次未读取到新的月度模型，保留 '+month(data.asOf)+' 缓存。'+error.message);}
    finally{refreshing=false;}
  }
  for(const button of toggles)button.addEventListener('click',()=>{button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));draw();});
  for(const button of document.querySelectorAll('[data-bond-range]'))button.addEventListener('click',()=>{
    range=button.dataset.bondRange;document.documentElement.dataset.bondRange=range;
    document.querySelectorAll('[data-bond-range]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw();
  });
  $('bondMonth').addEventListener('change',()=>{selected=$('bondMonth').value;updateSelection();});
  $('bondLatest').addEventListener('click',()=>{selected=data.asOf;updateSelection();});
  document.addEventListener('bond-refresh',refresh);
  try{
    range=document.documentElement.dataset.bondRange||document.querySelector('[data-bond-range][aria-pressed="true"]').dataset.bondRange;
    setData(JSON.parse($('embeddedBondData').textContent));
    new ResizeObserver(draw).observe($('bondChart'));
    refresh();
  }catch(error){$('bondWarning').hidden=false;$('bondWarning').textContent='美债图无法加载：'+error.message;$('bondDataStatus').textContent='月度模型暂不可用';}
})();
