const express = require('express');
const aggregationService = require('./service');

const router = express.Router();

router.post('/run', async (req, res, next) => {
  try {
    const result = await aggregationService.runFullAggregation(req.body.tank_code);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/identify', async (req, res, next) => {
  try {
    const result = await aggregationService.identifySegments(req.body.tank_code);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/merge', async (req, res, next) => {
  try {
    const result = await aggregationService.mergeAdjacentSegments(req.body.tank_code);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/segments', async (req, res, next) => {
  try {
    const { tank_code, start_time, end_time } = req.query;
    const result = await aggregationService.getSegments({
      tankCode: tank_code,
      startTime: start_time,
      endTime: end_time,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
