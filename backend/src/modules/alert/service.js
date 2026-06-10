const { query, getClient } = require('../../db');
const { calculateRate } = require('../aggregation/service');

const TRIGGER_RATIO = 1.5;
const RECOVER_RATIO = 1.2;
const TRIGGER_CONSECUTIVE = 2;
const RECOVER_CONSECUTIVE = 2;

async function evaluateAllAlerts() {
  const imbalanceResult = await checkImbalanceAlerts();
  return {
    success: true,
    imbalance_alerts: imbalanceResult,
  };
}

async function checkImbalanceAlerts() {
  const frontSegments = (await query(
    `SELECT * FROM usage_segments WHERE tank_code = 'FRONT' ORDER BY start_time ASC`
  )).rows;
  const rearSegments = (await query(
    `SELECT * FROM usage_segments WHERE tank_code = 'REAR' ORDER BY start_time ASC`
  )).rows;

  if (frontSegments.length === 0 || rearSegments.length === 0) {
    return { created: 0, resolved: 0, message: '数据不足' };
  }

  const paired = pairSegments(frontSegments, rearSegments);
  const client = await getClient();

  try {
    await client.query('BEGIN');
    let created = 0;
    let resolved = 0;

    await client.query(
      `DELETE FROM alerts WHERE alert_type = 'IMBALANCE' AND is_active = true`
    );

    let activeAlert = null;
    let triggerCount = 0;
    let recoverCount = 0;

    for (let i = 0; i < paired.length; i++) {
      const pair = paired[i];
      const frontRate = pair.front ? calculateRate(pair.front) : 0;
      const rearRate = pair.rear ? calculateRate(pair.rear) : 0;

      if (rearRate <= 0) continue;

      const ratio = frontRate / rearRate;

      if (ratio > TRIGGER_RATIO) {
        triggerCount++;
        if (triggerCount >= TRIGGER_CONSECUTIVE && !activeAlert) {
          const startTime = pair.time;
          activeAlert = {
            start_time: startTime,
            front_rate: frontRate,
            rear_rate: rearRate,
            ratio,
            trigger_pair_index: i,
          };
          const insertResult = await client.query(
            `INSERT INTO alerts (alert_type, tank_code, start_time, is_active, detail)
             VALUES ('IMBALANCE', 'FRONT', $1, true, $2) RETURNING id`,
            [
              startTime,
              JSON.stringify({
                start_front_rate: frontRate,
                start_rear_rate: rearRate,
                start_ratio: ratio,
                pairs_checked: paired.length,
              }),
            ]
          );
          activeAlert.id = insertResult.rows[0].id;
          created++;
          recoverCount = 0;
        }
      } else {
        triggerCount = 0;
      }

      if (activeAlert && ratio < RECOVER_RATIO) {
        recoverCount++;
        if (recoverCount >= RECOVER_CONSECUTIVE) {
          const currentDetailRes = await client.query(
            `SELECT detail FROM alerts WHERE id = $1`,
            [activeAlert.id]
          );
          let currentDetail = {};
          try {
            const raw = currentDetailRes.rows[0]?.detail;
            currentDetail = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
          } catch { currentDetail = {}; }
          const mergedDetail = JSON.stringify({
            ...currentDetail,
            end_front_rate: frontRate,
            end_rear_rate: rearRate,
            end_ratio: ratio,
          });
          await client.query(
            `UPDATE alerts SET end_time = $1, is_active = 0, detail = $2
             WHERE id = $3`,
            [pair.time, mergedDetail, activeAlert.id]
          );
          resolved++;
          activeAlert = null;
          recoverCount = 0;
        }
      } else if (activeAlert) {
        recoverCount = 0;
      }
    }

    await client.query('COMMIT');
    return { success: true, created, resolved, pairs_checked: paired.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function pairSegments(frontSegs, rearSegs) {
  const allTimes = new Map();
  for (const s of frontSegs) {
    const key = s.start_time.toISOString();
    if (!allTimes.has(key)) allTimes.set(key, { time: s.start_time, front: null, rear: null });
    allTimes.get(key).front = s;
  }
  for (const s of rearSegs) {
    const key = s.start_time.toISOString();
    if (!allTimes.has(key)) allTimes.set(key, { time: s.start_time, front: null, rear: null });
    allTimes.get(key).rear = s;
  }
  return Array.from(allTimes.values()).sort((a, b) => a.time - b.time);
}

async function getActiveAlerts() {
  const result = await query(
    `SELECT * FROM alerts WHERE is_active = true ORDER BY start_time DESC`
  );
  return {
    count: result.rows.length,
    data: result.rows,
  };
}

async function getAlertHistory({ alertType, startTime, endTime }) {
  const where = [];
  const params = [];
  let idx = 1;
  if (alertType) {
    where.push(`alert_type = $${idx++}`);
    params.push(alertType);
  }
  if (startTime) {
    where.push(`start_time >= $${idx++}`);
    params.push(new Date(startTime));
  }
  if (endTime) {
    where.push(`(end_time IS NULL OR end_time <= $${idx++})`);
    params.push(new Date(endTime));
  }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const result = await query(
    `SELECT * FROM alerts ${whereClause} ORDER BY start_time DESC LIMIT 500`,
    params
  );
  return {
    count: result.rows.length,
    data: result.rows,
  };
}

module.exports = {
  evaluateAllAlerts,
  checkImbalanceAlerts,
  getActiveAlerts,
  getAlertHistory,
  TRIGGER_RATIO,
  RECOVER_RATIO,
};
