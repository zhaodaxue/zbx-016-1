<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal-box" v-if="detail">
      <div class="modal-header">
        <div>
          <span :class="['tank-title-tag', detail.segment.tank_code === 'FRONT' ? 'front' : 'rear']">
            {{ detail.segment.tank_name }}
          </span>
          <h3 class="modal-title">取用段详情 #{{ detail.segment.id }}</h3>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="info-grid">
          <div class="info-item">
            <span class="label">开始时间</span>
            <span class="value">{{ formatFullTime(detail.segment.start_time) }}</span>
          </div>
          <div class="info-item">
            <span class="label">结束时间</span>
            <span class="value">{{ formatFullTime(detail.segment.end_time) }}</span>
          </div>
          <div class="info-item">
            <span class="label">持续时长</span>
            <span class="value highlight">{{ detail.segment.duration_minutes }} 分钟</span>
          </div>
          <div class="info-item">
            <span class="label">起始液位</span>
            <span class="value">{{ parseFloat(detail.segment.start_tons).toFixed(3) }} 吨</span>
          </div>
          <div class="info-item">
            <span class="label">结束液位</span>
            <span class="value">{{ parseFloat(detail.segment.end_tons).toFixed(3) }} 吨</span>
          </div>
          <div class="info-item">
            <span class="label">耗水量</span>
            <span class="value highlight">{{ parseFloat(detail.segment.consumed_tons).toFixed(3) }} 吨</span>
          </div>
          <div class="info-item">
            <span class="label">取用速率</span>
            <span class="value">{{ detail.segment.rate_tons_per_hour }} 吨/小时</span>
          </div>
          <div class="info-item">
            <span class="label">合并次数</span>
            <span class="value" :class="{ highlight: detail.segment.merge_count > 0 }">
              {{ detail.segment.merge_count || '0' }} 次
            </span>
          </div>
        </div>

        <div class="section-block">
          <h4 class="section-title">📈 分钟级液位曲线</h4>
          <div ref="chartRef" class="detail-chart"></div>
        </div>

        <div class="section-block">
          <h4 class="section-title">🔍 归因分析</h4>
          <div class="attribution-box" :class="getAttrClass(detail.attribution.reason)">
            <div class="attr-badge">{{ detail.attribution.reason_label }}</div>
            <div class="attr-desc">{{ detail.attribution.description }}</div>
            <div class="attr-detail">
              <div class="attr-rule-title">归因规则:</div>
              <ul class="attr-rules">
                <li>开阀前1分钟内两舱阀门同时开 → 并联取水</li>
                <li>否则，舱位编号末位为3的倍数 → 设备漂移</li>
                <li>其余 → 未知</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-primary" @click="$emit('close')">关闭</button>
      </div>
    </div>
    <div v-else class="loading-box">加载中...</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import { getSegmentDetail } from '../api';

const props = defineProps({
  segmentId: { type: [Number, String], required: true },
});
defineEmits(['close']);

const detail = ref(null);
const chartRef = ref(null);
let chart = null;

function formatFullTime(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function getAttrClass(r) {
  if (r === 'PARALLEL') return 'attr-parallel';
  if (r === 'DRIFT') return 'attr-drift';
  return 'attr-unknown';
}

function renderChart() {
  if (!chartRef.value || !detail.value) return;
  const segStart = new Date(detail.value.segment.start_time).getTime();
  const segEnd = new Date(detail.value.segment.end_time).getTime();

  const insideData = [];
  const outsideData = [];
  for (const p of detail.value.minute_curve) {
    const t = new Date(p.time).getTime();
    if (p.within_segment) insideData.push([t, p.remaining_tons]);
    else outsideData.push([t, p.remaining_tons]);
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26,32,44,0.9)',
      textStyle: { color: '#fff' },
      formatter: function (params) {
        const t = new Date(params[0].axisValue);
        return `<b>${formatFullTime(t)}</b><br/>${params[0].seriesName}: ${params[0].value[1].toFixed(3)} 吨`;
      },
    },
    grid: { left: 55, right: 20, top: 30, bottom: 40 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#cbd5e0' } },
      axisLabel: {
        color: '#718096',
        fontSize: 11,
        formatter: function (v) {
          const d = new Date(v);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
      },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: '吨',
      nameTextStyle: { color: '#718096' },
      axisLine: { lineStyle: { color: '#cbd5e0' } },
      axisLabel: { color: '#718096', fontSize: 11 },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
      scale: true,
    },
    markArea: {
      silent: false,
      data: [
        [
          { xAxis: segStart, itemStyle: { color: 'rgba(66,153,225,0.12)' } },
          { xAxis: segEnd },
        ],
      ],
    },
    series: [
      {
        name: '区间外液位',
        type: 'line',
        smooth: true,
        data: outsideData,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#a0aec0', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#a0aec0' },
      },
      {
        name: '取用段内液位',
        type: 'line',
        smooth: true,
        data: insideData,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: '#e53e3e', width: 3 },
        itemStyle: { color: '#e53e3e', borderColor: '#fff', borderWidth: 2 },
      },
    ],
  };
  if (!chart) chart = echarts.init(chartRef.value);
  chart.setOption(option, true);
}

async function loadDetail() {
  detail.value = await getSegmentDetail(props.segmentId);
  await nextTick();
  renderChart();
}

onMounted(loadDetail);
watch(() => props.segmentId, loadDetail);

onBeforeUnmount(() => {
  if (chart) { chart.dispose(); chart = null; }
});

window.addEventListener('resize', () => chart && chart.resize());
</script>

<style scoped>
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(3px);
}
.modal-box {
  background: white;
  width: 820px;
  max-width: 92vw;
  max-height: 90vh;
  border-radius: 14px;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  overflow: hidden;
}
.modal-header {
  padding: 18px 24px;
  background: linear-gradient(135deg, #f7fafc, #edf2f7);
  border-bottom: 1px solid #e2e8f0;
  display: flex; justify-content: space-between; align-items: center;
}
.modal-title {
  display: inline; font-size: 18px; color: #2d3748; margin-left: 10px;
  vertical-align: middle;
}
.tank-title-tag {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 12px; font-weight: 700;
  vertical-align: middle;
}
.tank-title-tag.front { background: #bee3f8; color: #2c5282; }
.tank-title-tag.rear { background: #c6f6d5; color: #22543d; }
.close-btn {
  background: transparent; border: none; font-size: 20px;
  cursor: pointer; color: #718096; padding: 4px 10px; border-radius: 6px;
}
.close-btn:hover { background: #e2e8f0; color: #2d3748; }

.modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; }

.info-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.info-item {
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
}
.info-item .label {
  display: block;
  font-size: 11px;
  color: #718096;
  margin-bottom: 4px;
}
.info-item .value {
  font-size: 14px;
  font-weight: 600;
  color: #2d3748;
  font-family: 'Consolas', monospace;
}
.info-item .value.highlight { color: #2b6cb0; }

.section-block { margin-bottom: 22px; }
.section-title {
  font-size: 15px;
  color: #2d3748;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #edf2f7;
}

.detail-chart { height: 240px; width: 100%; }

.attribution-box {
  border-radius: 10px;
  padding: 16px 20px;
  border-left: 5px solid;
}
.attr-parallel {
  background: #ebf8ff;
  border-color: #3182ce;
}
.attr-drift {
  background: #fefcbf;
  border-color: #d69e2e;
}
.attr-unknown {
  background: #f7fafc;
  border-color: #a0aec0;
}
.attr-badge {
  display: inline-block;
  font-size: 14px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  background: rgba(255,255,255,0.85);
}
.attr-parallel .attr-badge { color: #2c5282; }
.attr-drift .attr-badge { color: #744210; }
.attr-unknown .attr-badge { color: #4a5568; }
.attr-desc { font-size: 14px; color: #2d3748; margin-bottom: 10px; font-weight: 500; }
.attr-rule-title { font-size: 12px; color: #718096; margin-bottom: 4px; }
.attr-rules {
  list-style: none;
  padding: 0;
  margin: 0;
}
.attr-rules li {
  font-size: 12px;
  color: #4a5568;
  padding: 2px 0;
  padding-left: 16px;
  position: relative;
}
.attr-rules li::before {
  content: '•';
  position: absolute;
  left: 4px;
  color: #718096;
}

.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid #e2e8f0;
  text-align: right;
}
.btn-primary {
  background: #4299e1;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:hover { background: #3182ce; }

.loading-box {
  background: white;
  padding: 40px 60px;
  border-radius: 10px;
  color: #718096;
}
</style>
