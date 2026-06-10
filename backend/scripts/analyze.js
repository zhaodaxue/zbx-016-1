const { initDB, query } = require('../src/db');

(async () => {
  await initDB();

  console.log('=== 1. 所有取用段（按时间排序）===');
  const segs = await query('SELECT * FROM usage_segments ORDER BY tank_code, start_time ASC');
  if (!segs.rows) segs.rows = segs;
  const segList = segs.rows || segs;
  const start0 = new Date(segList[0].start_time).getTime();

  segList.forEach(s => {
    const st = Math.round((new Date(s.start_time).getTime() - start0)/60000);
    const et = Math.round((new Date(s.end_time).getTime() - start0)/60000);
    const r = (s.rate_tph !== undefined && s.rate_tph !== null) ? s.rate_tph : (s.consumed_tons / (s.duration_minutes/60));
    console.log('#' + s.id + ' ' + s.tank_code.padEnd(5) + ' start=+' + String(st).padStart(4) + ' end=+' + String(et).padStart(4) + ' dur=' + String(s.duration_minutes).padStart(3) + ' cons=' + (+s.consumed_tons).toFixed(2) + 't rate=' + (+r).toFixed(2) + 't/h merge=' + s.merge_count);
  });

  console.log('\n=== 2. FRONT 相邻段 gap 分析 ===');
  const front = segList.filter(s=>s.tank_code==='FRONT').sort((a,b)=>new Date(a.start_time)-new Date(b.start_time));
  for (let i=1; i<front.length; i++) {
    const gap = (new Date(front[i].start_time) - new Date(front[i-1].end_time))/60000;
    console.log('段#' + front[i-1].id + ' 结束 -> 段#' + front[i].id + ' 开始: gap=' + gap.toFixed(1) + 'min ' + (gap < 8 ? '[✅ GAP<8 应合并]' : '[❌ GAP>=8 不合并]'));
  }

  console.log('\n=== 3. REAR 相邻段 gap 分析 ===');
  const rear = segList.filter(s=>s.tank_code==='REAR').sort((a,b)=>new Date(a.start_time)-new Date(b.start_time));
  for (let i=1; i<rear.length; i++) {
    const gap = (new Date(rear[i].start_time) - new Date(rear[i-1].end_time))/60000;
    console.log('段#' + rear[i-1].id + ' 结束 -> 段#' + rear[i].id + ' 开始: gap=' + gap.toFixed(1) + 'min ' + (gap < 8 ? '[✅ GAP<8 应合并]' : '[❌ GAP>=8 不合并]'));
  }

  console.log('\n=== 4. pairSegments 模拟 ===');
  function calcRate(s) { const h = s.duration_minutes/60; return h>0 ? s.consumed_tons/h : 0; }
  const allTimes = new Map();
  for (const s of front) { const key = new Date(s.start_time).toISOString(); if (!allTimes.has(key)) allTimes.set(key,{time:s.start_time,front:null,rear:null}); allTimes.get(key).front=s; }
  for (const s of rear)  { const key = new Date(s.start_time).toISOString(); if (!allTimes.has(key)) allTimes.set(key,{time:s.start_time,front:null,rear:null}); allTimes.get(key).rear=s;  }
  const paired = Array.from(allTimes.values()).sort((a,b)=>a.time-b.time);
  console.log('配对数量:', paired.length);
  let triggerCount = 0, activeAlert = null;
  paired.forEach((p, idx) => {
    const fr = p.front ? calcRate(p.front) : 0;
    const rr = p.rear  ? calcRate(p.rear)  : 0;
    const ratio = rr > 0 ? fr/rr : 0;
    const has = (p.front ? 'F#'+p.front.id : '  .') + ' ' + (p.rear ? 'R#'+p.rear.id : '  .');
    const tStr = '+' + String(Math.round((new Date(p.time).getTime()-start0)/60000)).padStart(4);
    let mark = '';
    if (rr > 0 && ratio > 1.5) { triggerCount++; if (triggerCount>=2 && !activeAlert) { activeAlert=1; mark=' [触发告警!]'; } else mark=' 触发:'+triggerCount; } else { triggerCount=0; }
    if (rr > 0) console.log(String(idx+1).padStart(2)+'. time='+tStr+' '+has+'  FR='+fr.toFixed(2)+'  RR='+rr.toFixed(2)+'  ratio='+ratio.toFixed(2)+'x'+mark);
    else console.log(String(idx+1).padStart(2)+'. time='+tStr+' '+has+'  无配对(缺少后舱)');
  });

  console.log('\n=== 5. 告警表内容 ===');
  let alerts = await query('SELECT * FROM alerts ORDER BY start_time');
  if (!alerts.rows) alerts.rows = alerts;
  (alerts.rows || alerts).forEach(a => console.log('#'+a.id+' type='+a.alert_type+' active='+a.is_active+' start='+new Date(a.start_time).toISOString().slice(11,16)+' detail='+JSON.stringify(a.detail)));
})().catch(e => console.error(e.stack || e));
