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

    <AlertBanner
      :alerts="alertData"
      :active-selected-id="activeAlertId"
      @select-alert="handleSelectAlert"
    />

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
        <LevelChart
          ref="levelChartRef"
          :curve="curveData"
          :brush-range="brushRange"
          :highlight-range="highlightRange"
          :zoom-range="zoomRange"
          @brush-end="handleBrushEnd"
          @brush-clear="handleBrushClear"
          :style="{ height: '380px' }"
        />
      </section>

      <div class="content-row">
        <section class="segments-section card">
          <div class="section-header">
            <div class="section-title-wrap">
              <h2>📋 取用段列表</h2>
              <span v-if="activeAlertId" class="filter-badge">
                告警过滤中
                <button @click="activeAlertId = null; zoomRange = null">✕</button>
              </span>
              <span v-else-if="brushRange" class="filter-badge">
                选区过滤中
                <button @click="handleBrushClear">✕</button>
              </span>
            </div>
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
            :selected-id="selectedSegmentId"
            @select="handleSelectSegment"
            @toggle-select="handleToggleSegment"
          />
        </section>
      </div>
    </main>

    <SegmentDetail
      v-if="detailSegmentId"
      :segment-id="detailSegmentId"
      @close="detailSegmentId = null"
    />

    <div class="toast" :class="{ show: toastVisible }">
      {{ toastMessage }}
    </div>

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
const detailSegmentId = ref(null);
const activeAlertId = ref(null);

const brushRange = ref(null);
const highlightRange = ref(null);
const zoomRange = ref(null);

const levelChartRef = ref(null);
const toastMessage = ref('');
const toastVisible = ref(false);
let toastTimer = null;

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
    { label: '前舱余量(吨)', value: front ? parseFloat(front.current_tons).toFixed(1) : '--' },
    { label: '后舱余量(吨)', value: rear ? parseFloat(rear.current_tons).toFixed(1) : '--' },
    { label: '前舱耗用(吨)', value: segFront ? parseFloat(segFront.total_consumed || 0).toFixed(2) : '0.00' },
    { label: '活动告警', value: overview.value.alert_stats.active_count || 0 },
  ];
});

function timeOverlap(segStart, segEnd, rangeStart, rangeEnd) {
  const s1 = new Date(segStart).getTime();
  const e1 = new Date(segEnd).getTime();
  const s2 = new Date(rangeStart).getTime();
  const e2 = new Date(rangeEnd).getTime();
  return s1 < e2 && e1 > s2;
}

const effectiveFilterRange = computed(() => {
  if (activeAlertId.value) {
    const alert = alertData.value.find((a) => a.id === activeAlertId.value);
    if (alert) {
      const end = alert.end_time || getTimeRange().end;
      return { start: alert.start_time, end };
    }
  }
  if (brushRange.value) {
    return brushRange.value;
  }
  return null;
});

const filteredSegments = computed(() => {
  let list = segments.value;
  if (filterTank.value) {
    list = list.filter((s) => s.tank_code === filterTank.value);
  }
  if (effectiveFilterRange.value) {
    list = list.filter((s) =>
      timeOverlap(s.start_time, s.end_time, effectiveFilterRange.value.start, effectiveFilterRange.value.end)
    );
  }
  return list;
});

function showToast(msg) {
  toastMessage.value = msg;
  toastVisible.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastVisible.value = false;
  }, 2500);
}

function selectTimeRange(hours) {
  if (hours === selectedHours.value) return;
  const oldRange = getTimeRangeWithHours(selectedHours.value);
  const newRange = getTimeRangeWithHours(hours);
  const newStart = new Date(newRange.start).getTime();
  const newEnd = new Date(newRange.end).getTime();

  if (brushRange.value) {
    const bStart = new Date(brushRange.value.start).getTime();
    const bEnd = new Date(brushRange.value.end).getTime();
    const clippedStart = Math.max(bStart, newStart);
    const clippedEnd = Math.min(bEnd, newEnd);
    if (clippedStart < clippedEnd) {
      brushRange.value = {
        start: new Date(clippedStart).toISOString(),
        end: new Date(clippedEnd).toISOString(),
      };
    } else {
      brushRange.value = null;
    }
  }

  if (selectedSegmentId.value) {
    const seg = segments.value.find((s) => s.id === selectedSegmentId.value);
    if (seg) {
      const segStart = new Date(seg.start_time).getTime();
      const segEnd = new Date(seg.end_time).getTime();
      const segMid = (segStart + segEnd) / 2;
      if (segMid < newStart || segMid > newEnd) {
        selectedSegmentId.value = null;
        highlightRange.value = null;
        showToast('选中段不在新时间范围内，已取消选中');
      }
    }
  }

  if (activeAlertId.value) {
    const alert = alertData.value.find((a) => a.id === activeAlertId.value);
    if (alert) {
      const alertStart = new Date(alert.start_time).getTime();
      const alertEnd = alert.end_time ? new Date(alert.end_time).getTime() : newEnd;
      if (alertEnd < newStart || alertStart > newEnd) {
        activeAlertId.value = null;
        showToast('选中告警不在新时间范围内，已取消选中');
      }
    }
  }

  selectedHours.value = hours;
  loadAllData();
}

function getTimeRangeWithHours(hours) {
  const end = new Date();
  const start = new Date(Date.now() - hours * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getTimeRange() {
  return getTimeRangeWithHours(selectedHours.value);
}

async function loadCurve() {
  const { start, end } = getTimeRange();
  curveData.value = await getLevelCurve(start, end);
}

async function loadSegments() {
  const { start, end } = getTimeRange();
  const data = await getSegments({ start_time: start, end_time: end });
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
  detailSegmentId.value = id;
}

function handleToggleSegment(id) {
  if (selectedSegmentId.value === id) {
    selectedSegmentId.value = null;
    highlightRange.value = null;
    zoomRange.value = null;
  } else {
    selectedSegmentId.value = id;
    const seg = segments.value.find((s) => s.id === id);
    if (seg) {
      const start = new Date(seg.start_time).getTime();
      const end = new Date(seg.end_time).getTime();
      const pad = 15 * 60 * 1000;
      highlightRange.value = { start: seg.start_time, end: seg.end_time };
      zoomRange.value = {
        start: new Date(start - pad).toISOString(),
        end: new Date(end + pad).toISOString(),
      };
      activeAlertId.value = null;
    }
  }
}

function handleBrushEnd(range) {
  brushRange.value = range;
  activeAlertId.value = null;
}

function handleBrushClear() {
  brushRange.value = null;
}

function handleSelectAlert(alert) {
  if (activeAlertId.value === alert.id) {
    activeAlertId.value = null;
    zoomRange.value = null;
  } else {
    activeAlertId.value = alert.id;
    selectedSegmentId.value = null;
    highlightRange.value = null;
    const end = alert.end_time || getTimeRange().end;
    zoomRange.value = { start: alert.start_time, end };
  }
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
.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
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

.toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%) translateY(-20px);
  background: rgba(45, 55, 72, 0.92);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 10000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s, transform 0.3s;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ebf8ff;
  color: #2c5282;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}
.filter-badge button {
  background: none;
  border: none;
  color: #2c5282;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}
.filter-badge button:hover { color: #1a365d; }
</style>
