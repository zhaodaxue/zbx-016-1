const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const { initDB } = require('./db');
const sensorRouter = require('./modules/sensor/router');
const aggregationRouter = require('./modules/aggregation/router');
const alertRouter = require('./modules/alert/router');
const queryRouter = require('./modules/query/router');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/api/sensors', sensorRouter);
app.use('/api/aggregation', aggregationRouter);
app.use('/api/alerts', alertRouter);
app.use('/api/query', queryRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'freshwater-tracking-backend', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

async function start() {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 淡水舱耗用追踪服务已启动: http://0.0.0.0:${PORT}`);
  });
}

if (require.main === module) {
  start().catch((e) => {
    console.error('启动失败:', e);
    process.exit(1);
  });
}

module.exports = { app, start };
