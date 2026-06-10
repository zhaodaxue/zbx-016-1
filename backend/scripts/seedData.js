const { initDB, db } = require('../src/db');
const sensorService = require('../src/modules/sensor/service');
const aggregationService = require('../src/modules/aggregation/service');
const alertService = require('../src/modules/alert/service');

const HOURS_BACK = 24;
const END_TIME = new Date(Date.UTC(2026, 5, 10, 8, 0, 0, 0));
const START_TIME = new Date(END_TIME.getTime() - HOURS_BACK * 60 * 60 * 1000);

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function generateDeterministicTankData(tankCode, events) {
  const readings = [];
  let currentTons = events.startTons;

  for (let minute = 0; minute < HOURS_BACK * 60; minute += 10) {
    const time = addMinutes(START_TIME, minute);
    let valveOpen = false;
    let tonChange = 0;

    let inRecover = false;
    let recoverIdx = -1;

    for (let ei = 0; ei < events.events.length; ei++) {
      const ev = events.events[ei];
      const evEnd = ev.startMinute + ev.durationMin;
      if (minute >= ev.startMinute && minute < evEnd) {
        valveOpen = true;
        tonChange = -ev.dropPerStep;
        break;
      }
      const recoverStart = evEnd;
      const recoverEnd = evEnd + ev.recoverSteps * 10;
      if (minute >= recoverStart && minute < recoverEnd) {
        valveOpen = ev.valveOpenAfter || false;
        tonChange = ev.recoverTons;
        inRecover = true;
        recoverIdx = ei;
        break;
      }
    }

    if (!valveOpen && !inRecover) {
      tonChange = 0.0;
    }

    currentTons = Math.max(0, parseFloat((currentTons + tonChange).toFixed(4)));
    readings.push({
      tank_code: tankCode,
      remaining_tons: currentTons,
      valve_open: valveOpen,
      recorded_at: time,
    });
  }
  return readings;
}

async function clearTables() {
  db.exec(`
    DELETE FROM alerts;
    DELETE FROM usage_segments;
    DELETE FROM sensor_readings;
    DELETE FROM processing_markers;
    INSERT INTO processing_markers (id, last_processed_reading_id, last_processed_segment_id)
    VALUES (1, 0, 0);
  `);
  console.log('✅ 表已清空');
}

async function main() {
  await initDB();
  console.log('开始生成种子数据...');
  console.log(`时间范围: ${START_TIME.toISOString()} ~ ${END_TIME.toISOString()}`);

  const DROP_LOW = 0.32;
  const DROP_HIGH_FRONT = 0.50;
  const DROP_HIGH_REAR = 0.33;
  const RECOVER = 0.05;
  const RECOVER_STEPS = 3;

  const frontEvents = {
    startTons: 12.5,
    events: [
      { startMinute: 60,  durationMin: 30, dropPerStep: 0.35, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 240, durationMin: 30, dropPerStep: 0.38, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 420, durationMin: 30, dropPerStep: DROP_HIGH_FRONT, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: true  },
      { startMinute: 480, durationMin: 30, dropPerStep: 0.48, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 660, durationMin: 40, dropPerStep: DROP_HIGH_FRONT, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 840, durationMin: 40, dropPerStep: 0.49, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 1020, durationMin: 30, dropPerStep: DROP_HIGH_FRONT, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 1200, durationMin: 40, dropPerStep: 0.48, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
    ],
  };

  const rearEvents = {
    startTons: 13.0,
    events: [
      { startMinute: 60,  durationMin: 30, dropPerStep: 0.34, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 240, durationMin: 30, dropPerStep: 0.36, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 660, durationMin: 40, dropPerStep: DROP_HIGH_REAR, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 840, durationMin: 40, dropPerStep: 0.32, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 1020, durationMin: 30, dropPerStep: DROP_HIGH_REAR, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 1200, durationMin: 40, dropPerStep: 0.33, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
      { startMinute: 1320, durationMin: 30, dropPerStep: 0.35, recoverSteps: RECOVER_STEPS, recoverTons: RECOVER, valveOpenAfter: false },
    ],
  };

  const frontReadings = generateDeterministicTankData('FRONT', frontEvents);
  const rearReadings = generateDeterministicTankData('REAR', rearEvents);

  console.log(`生成数据量- 前舱: ${frontReadings.length}, 后舱: ${rearReadings.length}`);

  await clearTables();
  await sensorService.ingestBatch(frontReadings);
  console.log('✅ 前舱传感器数据已入库');
  await sensorService.ingestBatch(rearReadings);
  console.log('✅ 后舱传感器数据已入库');

  const frontId = await aggregationService.identifySegments('FRONT');
  const rearId = await aggregationService.identifySegments('REAR');
  console.log(`✅ 取用段识别完成 - FRONT:${frontId.created || 0}条(丢弃${frontId.discarded||0}), REAR:${rearId.created || 0}条(丢弃${rearId.discarded||0})`);

  const frontMerge = await aggregationService.mergeAdjacentSegments('FRONT');
  const rearMerge = await aggregationService.mergeAdjacentSegments('REAR');
  console.log(`✅ 合并完成 - 前舱: ${frontMerge.merged_count}次, 后舱: ${rearMerge.merged_count}次`);

  const segResult = await aggregationService.getSegments({});
  console.log(`✅ 取用段总数: ${segResult.count}`);

  const alertResult = await alertService.checkImbalanceAlerts();
  console.log(`✅ 告警判定完成 - 生成${alertResult.created}条, 结束${alertResult.resolved}条`);

  const alertList = await alertService.getAlertHistory({});
  alertList.data.forEach(a => {
    const status = a.is_active ? '活动中' : '已结束';
    const ratio = a.detail?.start_ratio;
    console.log(`   ⚠️ 告警 ID=${a.id} [${status}] 触发速率比=${ratio ? ratio.toFixed(2) : 'N/A'}x`);
  });

  const mergeSegs = (await aggregationService.getSegments({})).data.filter(s => s.merge_count > 0);
  mergeSegs.forEach(s => console.log(`   📌 合并段 ID=${s.id} ${s.tank_code}  合并次数=${s.merge_count}`));

  const cnt = db.prepare('SELECT COUNT(*) as c FROM sensor_readings').get();
  console.log(`\n🎉 种子数据生成完成! 总传感记录: ${cnt.c} 条`);
  return cnt.c;
}

module.exports = { main };

if (require.main === module) {
  main().catch(e => { console.error('生成种子数据失败:', e); process.exit(1); });
}
