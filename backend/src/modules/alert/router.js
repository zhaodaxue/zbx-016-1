const express = require('express');
const alertService = require('./service');

const router = express.Router();

router.post('/evaluate', async (req, res, next) => {
  try {
    const result = await alertService.evaluateAllAlerts();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/imbalance/check', async (req, res, next) => {
  try {
    const result = await alertService.checkImbalanceAlerts();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/active', async (req, res, next) => {
  try {
    const result = await alertService.getActiveAlerts();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const { alert_type, start_time, end_time } = req.query;
    const result = await alertService.getAlertHistory({
      alertType: alert_type,
      startTime: start_time,
      endTime: end_time,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
