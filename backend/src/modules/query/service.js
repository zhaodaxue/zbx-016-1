const { query } = require('../../db');
const { calculateRate } = require('../aggregation/service');

async function getLevelCurve({ startTime, endTime }) {
  const now = new Date();
  const defaultEnd = endTime ? new Date(endTime) : now;
  const defaultStart = startTime ? new Date(startTime) : new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const result = await query(
    `SELECT tank_code, remaining_tons, valve_open, recorded_at
     FROM sensor_readings
     WHERE recorded_at BETWEEN $1 AND $2
     ORDER BY tank_code, recorded_at ASC`,
    [defaultStart, defaultEnd]
  );

  const front = [];
  const rear = [];
  for (const r of result.rows) {
    const point = {
      time: r.recorded_at.toISOString(),
      value: parseFloat(r.remaining_tons),
      valve_open: r.valve_open,
    };
    if (r.tank_code === 'FRONT') front.push(point);
    else rear.push(point);
  }

  return {
    start_time: defaultStart.toISOString(),
    end_time: defaultEnd.toISOString(),
    FRONT: { count: front.length, data: front },
    REAR: { count: rear.length, data: rear },
  };
}

async function getSegmentList({ tankCode, startTime, endTime }) {
  const where = [];
  const params = [];
  let idx = 1;
  if (tankCode) {
    where.push(`s.tank_code = $${idx++}`);
    params.push(tankCode === '前舱' ? 'FRONT' : tankCode === '后舱' ? 'REAR' : tankCode);
  }
  if (startTime) {
    where.push(`s.start_time >= $${idx++}`);
    params.push(new Date(startTime));
  }
  if (endTime) {
    where.push(`s.end_time <= $${idx++}`);
    params.push(new Date(endTime));
  }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const result = await query(
    `SELECT s.*,
     (SELECT COUNT(*) FROM alerts a
      WHERE a.alert_type = 'IMBALANCE'
        AND (a.end_time IS NULL OR a.end_time > s.start_time)
        AND a.start_time < s.end_time) AS related_alert_count
     FROM usage_segments s ${whereClause}
     ORDER BY s.start_time DESC
     LIMIT 200`,
    params
  );

  const data = result.rows.map((s) => {
    const rate = calculateRate(s);
    return {
      ...s,
      rate_tons_per_hour: parseFloat(rate.toFixed(4)),
      tank_name: s.tank_code === 'FRONT' ? '前舱' : '后舱',
    };
  });

  return {
    count: data.length,
    data,
  };
}

async function getSegmentDetail(segmentId) {
  const segResult = await query(
    `SELECT * FROM usage_segments WHERE id = $1`,
    [parseInt(segmentId)]
  );
  if (segResult.rows.length === 0) {
    const err = new Error('取用段不存在');
    err.status = 404;
    throw err;
  }

  const segment = segResult.rows[0];
  const startBuffer = new Date(segment.start_time.getTime() - 2 * 60 * 1000);
  const endBuffer = new Date(segment.end_time.getTime() + 2 * 60 * 1000);

  const readings = await query(
    `SELECT tank_code, remaining_tons, valve_open, recorded_at
     FROM sensor_readings
     WHERE tank_code = $1 AND recorded_at BETWEEN $2 AND $3
     ORDER BY recorded_at ASC`,
    [segment.tank_code, startBuffer, endBuffer]
  );

  const minuteData = [];
  for (const r of readings.rows) {
    minuteData.push({
      time: r.recorded_at.toISOString(),
      remaining_tons: parseFloat(r.remaining_tons),
      valve_open: r.valve_open,
      within_segment: r.recorded_at >= segment.start_time && r.recorded_at <= segment.end_time,
    });
  }

  const attribution = await determineAttribution(segment);
  const rate = calculateRate(segment);

  return {
    segment: {
      ...segment,
      rate_tons_per_hour: parseFloat(rate.toFixed(4)),
      tank_name: segment.tank_code === 'FRONT' ? '前舱' : '后舱',
    },
    minute_curve: minuteData,
    attribution,
  };
}

async function determineAttribution(segment) {
  const startMinus1 = new Date(segment.start_time.getTime() - 1 * 60 * 1000);

  const otherTank = segment.tank_code === 'FRONT' ? 'REAR' : 'FRONT';

  const bothValveOpen = await query(
    `SELECT
       (SELECT valve_open FROM sensor_readings
        WHERE tank_code = $1 AND recorded_at BETWEEN $2 AND $3
        ORDER BY recorded_at DESC LIMIT 1) AS seg_valve,
       (SELECT valve_open FROM sensor_readings
        WHERE tank_code = $4 AND recorded_at BETWEEN $2 AND $3
        ORDER BY recorded_at DESC LIMIT 1) AS other_valve`,
    [segment.tank_code, startMinus1, segment.start_time, otherTank]
  );

  if (bothValveOpen.rows[0].seg_valve === true && bothValveOpen.rows[0].other_valve === true) {
    return {
      reason: 'PARALLEL',
      reason_label: '并联取水',
      description: '开阀前1分钟内两舱阀门同时开启',
    };
  }

  const segIdStr = segment.id.toString();
  const lastDigit = parseInt(segIdStr.charAt(segIdStr.length - 1));
  if (lastDigit % 3 === 0 && lastDigit !== 0) {
    return {
      reason: 'DRIFT',
      reason_label: '设备漂移',
      description: '舱位编号末位为3的倍数，疑似设备漂移',
    };
  }

  return {
    reason: 'UNKNOWN',
    reason_label: '未知',
    description: '未识别到明确取用水因',
  };
}

async function getAlertSummary(includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE is_active = true';
  const result = await query(
    `SELECT * FROM alerts ${where} ORDER BY start_time DESC LIMIT 100`
  );

  const data = result.rows.map((a) => ({
    ...a,
    alert_label: a.alert_type === 'IMBALANCE' ? '不均衡告警' : a.alert_type,
    status_label: a.is_active ? '活动中' : '已结束',
  }));

  const activeCount = data.filter((d) => d.is_active).length;

  return {
    active_count: activeCount,
    total_count: data.length,
    data,
  };
}

async function getOverview(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const readingStats = await query(
    `SELECT tank_code,
            MIN(remaining_tons) as min_tons,
            MAX(remaining_tons) as max_tons,
            COUNT(*) as reading_count
     FROM sensor_readings
     WHERE recorded_at >= $1
     GROUP BY tank_code`,
    [cutoff]
  );

  const latestReadings = await query(
    `SELECT s.tank_code, s.remaining_tons as current_tons, s.recorded_at as last_recorded_at
     FROM sensor_readings s
     INNER JOIN (
       SELECT tank_code, MAX(recorded_at) as max_time
       FROM sensor_readings
       GROUP BY tank_code
     ) m ON s.tank_code = m.tank_code AND s.recorded_at = m.max_time`
  );

  const segmentStats = await query(
    `SELECT tank_code,
            COUNT(*) as segment_count,
            SUM(consumed_tons) as total_consumed,
            AVG(consumed_tons) as avg_consumed,
            SUM(merge_count) as total_merges
     FROM usage_segments
     WHERE start_time >= $1
     GROUP BY tank_code`,
    [cutoff]
  );

  const alertStats = await query(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
     FROM alerts
     WHERE start_time >= $1`,
    [cutoff]
  );

  const latestMap = {};
  for (const r of latestReadings.rows) {
    latestMap[r.tank_code] = {
      current_tons: parseFloat(r.current_tons),
      last_recorded_at: r.last_recorded_at,
    };
  }

  const mergedReadingStats = readingStats.rows.map((r) => ({
    ...r,
    min_tons: parseFloat(r.min_tons),
    max_tons: parseFloat(r.max_tons),
    current_tons: latestMap[r.tank_code]?.current_tons || 0,
    last_recorded_at: latestMap[r.tank_code]?.last_recorded_at || null,
  }));

  const mergedSegmentStats = segmentStats.rows.map((r) => ({
    ...r,
    segment_count: parseInt(r.segment_count),
    total_consumed: parseFloat(r.total_consumed || 0),
    avg_consumed: parseFloat(r.avg_consumed || 0),
    total_merges: parseInt(r.total_merges || 0),
  }));

  return {
    hours,
    reading_stats: mergedReadingStats,
    segment_stats: mergedSegmentStats,
    alert_stats: {
      total: parseInt(alertStats.rows[0]?.total || 0),
      active_count: parseInt(alertStats.rows[0]?.active_count || 0),
    },
  };
}

module.exports = {
  getLevelCurve,
  getSegmentList,
  getSegmentDetail,
  getAlertSummary,
  getOverview,
};
