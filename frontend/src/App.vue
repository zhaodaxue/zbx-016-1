<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <div class="logo-icon">⚓</div>
        <div class="header-title">
          <h1>浙运 018 · 淡水舱隔舱耗用追踪系统</h1>
          <p>内河货船 · 本地部署 · 离线运行</p>
        </div>
      </div>
      <div class="header-right">
        <div class="stat-card" v-for="s in overviewStats" :key="s.label">
          <span class="stat-value">{{ s.value }}</span>
          <span class="stat-label">{{ s.label }}</span>
        </div>
        <button class="refresh-btn" @click="loadAllData" :disabled="loading">
          {{ loading ? '加载中...' : '🔄 刷新' }}
        </button>
      </div>
    </header>

    <AlertBanner :alerts="alertData" />

    <main class="main-content">
      <section class="chart-section card">
        <div class="section-header">
          <h2>📊 双舱液位趋势图</h2>
          <div class="time-selector">
            <button
              v-for="opt in timeOptions"
              :key="opt.hours"
              :class="['time-btn', { active: selectedHours === opt.hours }]"
              @click="selectTimeRange(opt.hours)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <LevelChart :curve="curveData" :style="{ height: '380px' }" />
      </section>

      <div class="content-row">
        <section class="segments-section card">
          <div class="section-header">
            <h2>📋 取用段列表</h2>
            <div class="filter-group">
              <select v-model="filterTank" class="filter-select">
                <option value="">全部舱位</option>
                <option value="FRONT">前舱</option>
                <option value="REAR">后舱</option>
              </select>
            </div>
          </div>
          <SegmentList
            :segments="filteredSegments"
            :loading="loading"
            @select="handleSelectSegment"
          />
        </section>
      </div>
    </main>

    <SegmentDetail
      v-if="selectedSegmentId"
      :segment-id="selectedSegmentId"
      @close="selectedSegmentId = null"
    />

    <footer class="app-footer">
      <span>淡水舱耗用追踪系统 v1.0.0 | 船端本地部署 | 每10分钟采集</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import AlertBanner from './components/AlertBanner.vue';
import LevelChart from './components/LevelChart.vue';
import SegmentList from './components/SegmentList.vue';
import SegmentDetail from './components/SegmentDetail.vue';
import { getLevelCurve, getSegments, getAlerts, getOverview } from './api';

const loading = ref(false);
const selectedHours = ref(24);
const filterTank = ref('');
const selectedSegmentId = ref(null);

const curveData = ref({ FRONT: { data: [] }, REAR: { data: [] } });
const segments = ref([]);
const alertData = ref([]);
const overview = ref({ reading_stats: [], segment_stats: [], alert_stats: {} });

const timeOptions = [
  { hours: 6, label: '近6小时' },
  { hours: 12, label: '近12小时' },
  { hours: 24, label: '近24小时' },
];

const overviewStats = computed(() => {
  const front = overview.value.reading_stats.find((r) => r.tank_code === 'FRONT');
  const rear = overview.value.reading_stats.find((r) => r.tank_code === 'REAR');
  const segFront = overview.value.segment_stats.find((r) => r.tank_code === 'FRONT');
  const segRear = overview.value.segment_stats.find((r) => r.tank_code === 'REAR');
  return [
    { label: '前舱余量(吨)', value: front ? parseFloat(front.max_tons).toFixed(1) : '--' },
    { label: '后舱余量(吨)', value: rear ? parseFloat(rear.max_tons).toFixed(1) : '--' },
    { label: '前舱耗用(吨)', value: segFront ? parseFloat(segFront.total_consumed || 0).toFixed(2) : '0.00' },
    { label: '活动告警', value: overview.value.alert_stats.active_count || 0 },
  ];
});

const filteredSegments = computed(() => {
  if (!filterTank.value) return segments.value;
  return segments.value.filter((s) => s.tank_code === filterTank.value);
});

function selectTimeRange(hours) {
  selectedHours.value = hours;
  loadCurve();
}

async function loadCurve() {
  const end = new Date();
  const start = new Date(Date.now() - selectedHours.value * 60 * 60 * 1000);
  curveData.value = await getLevelCurve(start.toISOString(), end.toISOString());
}

async function loadSegments() {
  const data = await getSegments({});
  segments.value = data.data || [];
}

async function loadAlerts() {
  const data = await getAlerts(true);
  alertData.value = data.data || [];
}

async function loadOverview() {
  overview.value = await getOverview(selectedHours.value);
}

async function loadAllData() {
  loading.value = true;
  try {
    await Promise.all([loadCurve(), loadSegments(), loadAlerts(), loadOverview()]);
  } catch (e) {
    console.error('加载失败:', e);
  } finally {
    loading.value = false;
  }
}

function handleSelectSegment(id) {
  selectedSegmentId.value = id;
}

onMounted(loadAllData);
setInterval(() => loadAllData(), 60000);
</script>

<style scoped>
.app-container { display: flex; flex-direction: column; min-height: 100vh; }
.app-header {
  background: linear-gradient(135deg, #1e3a5f, #2c5282);
  color: white;
  padding: 16px 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
}
.header-left { display: flex; align-items: center; gap: 16px; }
.logo-icon { font-size: 40px; }
.header-title h1 { font-size: 22px; font-weight: 600; letter-spacing: 1px; }
.header-title p { font-size: 13px; opacity: 0.85; margin-top: 4px; }
.header-right { display: flex; align-items: center; gap: 14px; }
.stat-card {
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(10px);
  padding: 10px 18px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 100px;
}
.stat-value { font-size: 20px; font-weight: 700; }
.stat-label { font-size: 12px; opacity: 0.85; margin-top: 2px; }
.refresh-btn {
  background: #4fd1c5;
  color: #1a365d;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
}
.refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.refresh-btn:hover { background: #38b2ac; }

.main-content {
  flex: 1;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card {
  background: white;
  border-radius: 14px;
  padding: 20px 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-header h2 { font-size: 17px; color: #2d3748; }
.time-selector { display: flex; gap: 8px; }
.time-btn {
  padding: 6px 14px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #4a5568;
}
.time-btn.active {
  background: #2c5282;
  color: white;
  border-color: #2c5282;
}
.filter-select {
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
}

.content-row { display: flex; flex-direction: column; gap: 20px; }

.app-footer {
  background: #1a202c;
  color: #a0aec0;
  text-align: center;
  padding: 12px;
  font-size: 12px;
}
</style>
