const { query, getClient } = require('../../db');

const VALID_TANKS = ['FRONT', 'REAR', '前舱', '后舱'];
const TANK_MAP = { '前舱': 'FRONT', '后舱': 'REAR', 'FRONT': 'FRONT', 'REAR': 'REAR' };

function normalizeTankCode(tankCode) {
  const mapped = TANK_MAP[tankCode];
  if (!mapped) throw new Error(`无效舱位: ${tankCode}，有效值: FRONT/REAR/前舱/后舱`);
  return mapped;
}

function validateReading(data) {
  const errors = [];
  if (!data.tank_code) errors.push('缺少 tank_code 字段');
  if (typeof data.remaining_tons !== 'number' || data.remaining_tons < 0) {
    errors.push('remaining_tons 必须为非负数');
  }
  if (typeof data.valve_open !== 'boolean') {
    if (data.valve_open === '开' || data.valve_open === '关') {
      data.valve_open = data.valve_open === '开';
    } else {
      errors.push('valve_open 必须为 boolean 或 开/关');
    }
  }
  if (!data.recorded_at) {
    data.recorded_at = new Date().toISOString();
  }
  return errors;
}

async function ingestReading(data) {
  const errors = validateReading(data);
  if (errors.length > 0) {
    const err = new Error('校验失败: ' + errors.join('; '));
    err.status = 400;
    throw err;
  }

  const tankCode = normalizeTankCode(data.tank_code);
  const recordedAt = new Date(data.recorded_at);

  const result = await query(
    `INSERT INTO sensor_readings (tank_code, remaining_tons, valve_open, recorded_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, tank_code, remaining_tons, valve_open, recorded_at`,
    [tankCode, data.remaining_tons, data.valve_open, recordedAt]
  );

  return {
    success: true,
    reading: result.rows[0],
  };
}

async function ingestBatch(readings) {
  if (!Array.isArray(readings) || readings.length === 0) {
    const err = new Error('readings 必须为非空数组');
    err.status = 400;
    throw err;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const inserted = [];
    const failed = [];

    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      try {
        const errors = validateReading(r);
        if (errors.length > 0) {
          failed.push({ index: i, errors });
          continue;
        }
        const tankCode = normalizeTankCode(r.tank_code);
        const recordedAt = new Date(r.recorded_at);
        const result = await client.query(
          `INSERT INTO sensor_readings (tank_code, remaining_tons, valve_open, recorded_at)
           VALUES ($1, $2, $3, $4)
           RETURNING id, tank_code, remaining_tons, valve_open, recorded_at`,
          [tankCode, r.remaining_tons, r.valve_open, recordedAt]
        );
        inserted.push(result.rows[0]);
      } catch (e) {
        failed.push({ index: i, error: e.message });
      }
    }

    await client.query('COMMIT');
    return {
      success: true,
      inserted_count: inserted.length,
      failed_count: failed.length,
      failed,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getReadings({ tankCode, startTime, endTime, limit = 1000 }) {
  const where = [];
  const params = [];
  let idx = 1;

  if (tankCode) {
    where.push(`tank_code = $${idx++}`);
    params.push(normalizeTankCode(tankCode));
  }
  if (startTime) {
    where.push(`recorded_at >= $${idx++}`);
    params.push(new Date(startTime));
  }
  if (endTime) {
    where.push(`recorded_at <= $${idx++}`);
    params.push(new Date(endTime));
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const sql = `SELECT id, tank_code, remaining_tons, valve_open, recorded_at
               FROM sensor_readings ${whereClause}
               ORDER BY recorded_at ASC LIMIT $${idx}`;
  params.push(limit);

  const result = await query(sql, params);
  return {
    count: result.rows.length,
    data: result.rows,
  };
}

module.exports = {
  ingestReading,
  ingestBatch,
  getReadings,
  normalizeTankCode,
};
