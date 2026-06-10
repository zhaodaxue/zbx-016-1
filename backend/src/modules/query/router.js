const express = require('express');
const queryService = require('./service');

const router = express.Router();

router.get('/level-curve', async (req, res, next) => {
  try {
    const { start_time, end_time } = req.query;
    const result = await queryService.getLevelCurve({
      startTime: start_time,
      endTime: end_time,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/segments', async (req, res, next) => {
  try {
    const { tank_code, start_time, end_time } = req.query;
    const result = await queryService.getSegmentList({
      tankCode: tank_code,
      startTime: start_time,
      endTime: end_time,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/segments/:id', async (req, res, next) => {
  try {
    const result = await queryService.getSegmentDetail(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/alerts', async (req, res, next) => {
  try {
    const { include_inactive } = req.query;
    const result = await queryService.getAlertSummary(include_inactive === 'true');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const { hours } = req.query;
    const result = await queryService.getOverview(hours ? parseInt(hours) : 24);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
