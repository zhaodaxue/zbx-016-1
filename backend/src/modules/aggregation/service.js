const { query, getClient } = require('../../db');
const { normalizeTankCode } = require('../sensor/service');

const DROP_THRESHOLD = 0.3;
const MIN_DURATION_MIN = 20;
const MERGE_WINDOW_MIN = 30;
const MERGE_GAP_MIN = 8;
const RECOVER_READING_COUNT = 3;

async function runFullAggregation(tankCode) {
  const tanks = tankCode ? [normalizeTankCode(tankCode)] : ['FRONT', 'REAR'];
  const results = {};
  for (const tank of tanks) {
    const identifyResult = await identifySegments(tank);
    const mergeResult = await mergeAdjacentSegments(tank);
    results[tank] = {
      identified: identifyResult,
      merged: mergeResult,
    };
  }
  return {
    success: true,
    results,
  };
}

async function identifySegments(tankCode) {
  const tank = normalizeTankCode(tankCode);
  const readings = (await query(
    `SELECT id, remaining_tons, valve_open, recorded_at
     FROM sensor_readings
     WHERE tank_code = $1 ORDER BY recorded_at ASC`,
    [tank]
  )).rows;

  if (readings.length < 2) {
    return { success: true, created: 0, discarded: 0, message: '数据不足' };
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM usage_segments WHERE tank_code = $1', [tank]);

    let created = 0;
    let discarded = 0;
    let currentSegment = null;
    let recoverCount = 0;
    let prevReading = readings[0];

    for (let i = 1; i < readings.length; i++) {
      const r = readings[i];
      const timeDiffMin = (r.recorded_at - prevReading.recorded_at) / (1000 * 60);
      const tonDiff = prevReading.remaining_tons - r.remaining_tons;

      if (!currentSegment) {
        if (prevReading.valve_open === true && tonDiff > DROP_THRESHOLD) {
          currentSegment = {
            tank_code: tank,
            start_time: prevReading.recorded_at,
            end_time: r.recorded_at,
            start_tons: prevReading.remaining_tons,
            end_tons: r.remaining_tons,
            start_reading_id: prevReading.id,
            end_reading_id: r.id,
          };
          recoverCount = 0;
        }
      } else {
        currentSegment.end_time = r.recorded_at;
        currentSegment.end_tons = r.remaining_tons;
        currentSegment.end_reading_id = r.id;

        if (r.remaining_tons > prevReading.remaining_tons) {
          recoverCount++;
          if (recoverCount >= RECOVER_READING_COUNT) {
            const durationMin = (currentSegment.end_time - currentSegment.start_time) / (1000 * 60);
            if (durationMin >= MIN_DURATION_MIN) {
              const consumed = currentSegment.start_tons - currentSegment.end_tons;
              await client.query(
                `INSERT INTO usage_segments
                 (tank_code, start_time, end_time, start_tons, end_tons, consumed_tons, duration_minutes, merge_count, start_reading_id, end_reading_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [
                  tank,
                  currentSegment.start_time,
                  currentSegment.end_time,
                  currentSegment.start_tons,
                  currentSegment.end_tons,
                  Math.max(0, consumed),
                  Math.round(durationMin),
                  0,
                  currentSegment.start_reading_id,
                  currentSegment.end_reading_id,
                ]
              );
              created++;
            } else {
              discarded++;
            }
            currentSegment = null;
            recoverCount = 0;
          }
        } else {
          recoverCount = 0;
        }
      }
      prevReading = r;
    }

    if (currentSegment) {
      const durationMin = (currentSegment.end_time - currentSegment.start_time) / (1000 * 60);
      if (durationMin >= MIN_DURATION_MIN) {
        const consumed = currentSegment.start_tons - currentSegment.end_tons;
        await client.query(
          `INSERT INTO usage_segments
           (tank_code, start_time, end_time, start_tons, end_tons, consumed_tons, duration_minutes, merge_count, start_reading_id, end_reading_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tank,
            currentSegment.start_time,
            currentSegment.end_time,
            currentSegment.start_tons,
            currentSegment.end_tons,
            Math.max(0, consumed),
            Math.round(durationMin),
            0,
            currentSegment.start_reading_id,
            currentSegment.end_reading_id,
          ]
        );
        created++;
      } else {
        discarded++;
      }
    }

    await client.query('COMMIT');
    return { success: true, tank_code: tank, created, discarded };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function mergeAdjacentSegments(tankCode) {
  const tank = normalizeTankCode(tankCode);
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let mergedCount = 0;
    let hasChanges = true;

    while (hasChanges) {
      hasChanges = false;
      const segments = (await client.query(
        `SELECT * FROM usage_segments WHERE tank_code = $1 ORDER BY start_time ASC`,
        [tank]
      )).rows;

      for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const curr = segments[i];
        const gapMin = (curr.start_time - prev.end_time) / (1000 * 60);

        if (gapMin < MERGE_GAP_MIN) {
          const newStartTons = prev.start_tons;
          const newEndTons = Math.min(prev.end_tons, curr.end_tons);
          const newConsumed = newStartTons - newEndTons;
          const newDuration = Math.round((curr.end_time - prev.start_time) / (1000 * 60));
          const newMergeCount = (prev.merge_count || 0) + (curr.merge_count || 0) + 1;

          await client.query('DELETE FROM usage_segments WHERE id = $1 OR id = $2', [prev.id, curr.id]);
          const insertResult = await client.query(
            `INSERT INTO usage_segments
             (tank_code, start_time, end_time, start_tons, end_tons, consumed_tons, duration_minutes, merge_count, start_reading_id, end_reading_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id`,
            [
              tank,
              prev.start_time,
              curr.end_time,
              newStartTons,
              newEndTons,
              Math.max(0, newConsumed),
              newDuration,
              newMergeCount,
              prev.start_reading_id,
              curr.end_reading_id,
            ]
          );
          mergedCount++;
          hasChanges = true;
          break;
        }
      }
    }

    await client.query('COMMIT');
    return { success: true, tank_code: tank, merged_count: mergedCount };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getSegments({ tankCode, startTime, endTime }) {
  const where = [];
  const params = [];
  let idx = 1;
  if (tankCode) {
    where.push(`tank_code = $${idx++}`);
    params.push(normalizeTankCode(tankCode));
  }
  if (startTime) {
    where.push(`start_time >= $${idx++}`);
    params.push(new Date(startTime));
  }
  if (endTime) {
    where.push(`end_time <= $${idx++}`);
    params.push(new Date(endTime));
  }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const result = await query(
    `SELECT * FROM usage_segments ${whereClause} ORDER BY start_time DESC`,
    params
  );
  return {
    count: result.rows.length,
    data: result.rows,
  };
}

function calculateRate(segment) {
  const hours = segment.duration_minutes / 60;
  if (hours <= 0) return 0;
  return segment.consumed_tons / hours;
}

module.exports = {
  runFullAggregation,
  identifySegments,
  mergeAdjacentSegments,
  getSegments,
  calculateRate,
};
