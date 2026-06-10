async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startServer() {
  console.log('🚀 初始化 SQLite 数据库和服务...');
  const { initDB } = require('../src/db');
  await initDB();

  const shouldSeed = process.env.SEED_ON_START !== 'false';
  if (shouldSeed) {
    console.log('🌱 执行种子数据生成...');
    try {
      await require('../scripts/seedData').main();
      console.log('✅ 种子数据生成完成');
    } catch (e) {
      console.error('⚠️ 种子数据生成失败:', e.message, e.stack);
    }
  }

  console.log('🌐 启动 HTTP 服务...');
  const { start } = require('../src/index');
  await start();
}

startServer();
