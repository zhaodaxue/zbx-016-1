const express = require('express');
const sensorService = require('./service');

const router = express.Router();

router.post('/reading', async (req, res, next) => {
  try {
    const result = await sensorService.ingestReading(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/batch', async (req, res, next) => {
  try {
    const result = await sensorService.ingestBatch(req.body.readings || []);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/readings', async (req, res, next) => {
  try {
    const { tank_code, start_time, end_time, limit } = req.query;
    const result = await sensorService.getReadings({
      tankCode: tank_code,
      startTime: start_time,
      endTime: end_time,
      limit: limit ? parseInt(limit) : 1000,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
