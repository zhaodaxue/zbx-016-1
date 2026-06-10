<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';

const props = defineProps({
  curve: { type: Object, default: () => ({ FRONT: { data: [] }, REAR: { data: [] } }) },
  brushRange: { type: Object, default: null },
  highlightRange: { type: Object, default: null },
  zoomRange: { type: Object, default: null },
});

const emit = defineEmits(['brushEnd', 'brushClear']);

const chartRef = ref(null);
let chart = null;

function transformData(list) {
  return list.map((p) => [new Date(p.time).getTime(), p.value]);
}

function getValveMarkPoints(list, label) {
  const points = [];
  for (const p of list) {
    if (p.valve_open) {
      points.push({
        name: `${label}开阀`,
        xAxis: new Date(p.time).getTime(),
        yAxis: p.value,
        symbol: 'pin',
        symbolSize: 28,
        itemStyle: { color: label === '前舱' ? '#f6ad55' : '#68d391' },
        label: { formatter: '●', color: 'white', fontSize: 10 },
      });
    }
  }
  return points;
}

function getDataExtent() {
  const frontData = transformData(props.curve.FRONT?.data || []);
  const rearData = transformData(props.curve.REAR?.data || []);
  const all = [...frontData, ...rearData];
  if (all.length === 0) {
    const end = Date.now();
    const start = end - 24 * 60 * 60 * 1000;
    return [start, end];
  }
  let min = Infinity, max = -Infinity;
  for (const p of all) {
    if (p[0] < min) min = p[0];
    if (p[0] > max) max = p[0];
  }
  return [min, max];
}

function timeToPercent(ts, extent) {
  const [min, max] = extent;
  if (max === min) return 0;
  return ((ts - min) / (max - min)) * 100;
}

function render() {
  if (!chart) return;
  const frontData = transformData(props.curve.FRONT?.data || []);
  const rearData = transformData(props.curve.REAR?.data || []);
  const frontValve = getValveMarkPoints(props.curve.FRONT?.data || [], '前舱');
  const rearValve = getValveMarkPoints(props.curve.REAR?.data || [], '后舱');
  const extent = getDataExtent();

  const markAreas = [];
  if (props.highlightRange) {
    const hStart = new Date(props.highlightRange.start).getTime();
    const hEnd = new Date(props.highlightRange.end).getTime();
    markAreas.push([
      {
        xAxis: hStart,
        itemStyle: { color: 'rgba(72, 187, 120, 0.25)' },
      },
      { xAxis: hEnd },
    ]);
  }

  const dataZoomConfig = [
    {
      type: 'inside',
      start: 0,
      end: 100,
      zoomOnMouseWheel: true,
      moveOnMouseMove: true,
    },
    {
      type: 'slider',
      start: 0,
      end: 100,
      height: 20,
      bottom: 10,
      borderColor: 'transparent',
      backgroundColor: '#edf2f7',
      fillerColor: 'rgba(44, 82, 130, 0.2)',
      handleStyle: { color: '#2c5282' },
      textStyle: { color: '#718096' },
    },
  ];

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26,32,44,0.9)',
      borderColor: 'transparent',
      textStyle: { color: '#fff' },
      formatter: function (params) {
        if (!params || params.length === 0) return '';
        const t = new Date(params[0].axisValue);
        let html = `<div style="font-weight:600;margin-bottom:6px">${t.toLocaleString('zh-CN')}</div>`;
        for (const p of params) {
          if (p.value && p.value.length >= 2) {
            html += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
              <span>${p.seriesName}:</span>
              <span style="font-weight:600">${p.value[1].toFixed(3)} 吨</span>
            </div>`;
          }
        }
        return html;
      },
    },
    legend: {
      top: 4,
      right: 16,
      data: ['前舱液位', '后舱液位'],
      textStyle: { color: '#4a5568' },
    },
    grid: { left: 50, right: 30, top: 50, bottom: 50 },
    toolbox: {
      feature: {
        brush: {
          type: ['lineX', 'clear'],
          title: {
            lineX: '框选时间窗',
            clear: '清除选区',
          },
        },
      },
      right: 16,
      top: 4,
    },
    brush: {
      toolbox: ['lineX', 'clear'],
      xAxisIndex: 0,
      brushStyle: {
        borderWidth: 1,
        color: 'rgba(44, 82, 130, 0.18)',
        borderColor: '#2c5282',
      },
      throttleType: 'debounce',
      throttleDelay: 300,
      brushMode: 'single',
    },
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
      name: '液位(吨)',
      nameTextStyle: { color: '#718096', fontSize: 12 },
      axisLine: { lineStyle: { color: '#cbd5e0' } },
      axisLabel: { color: '#718096', fontSize: 11, formatter: '{value}' },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
      scale: true,
    },
    dataZoom: dataZoomConfig,
    series: [
      {
        name: '前舱液位',
        type: 'line',
        smooth: true,
        data: frontData,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#4299e1', width: 2.5 },
        itemStyle: { color: '#4299e1' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(66,153,225,0.28)' },
            { offset: 1, color: 'rgba(66,153,225,0.02)' },
          ]),
        },
        markArea: markAreas.length > 0 ? { silent: true, data: markAreas } : undefined,
        markPoint: {
          data: frontValve,
          tooltip: { formatter: '开阀状态' },
        },
      },
      {
        name: '后舱液位',
        type: 'line',
        smooth: true,
        data: rearData,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#38a169', width: 2.5 },
        itemStyle: { color: '#38a169' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(56,161,105,0.28)' },
            { offset: 1, color: 'rgba(56,161,105,0.02)' },
          ]),
        },
        markPoint: {
          data: rearValve,
          tooltip: { formatter: '开阀状态' },
        },
      },
    ],
  };

  chart.setOption(option, true);

  if (props.zoomRange) {
    const zStart = new Date(props.zoomRange.start).getTime();
    const zEnd = new Date(props.zoomRange.end).getTime();
    const pStart = Math.max(0, Math.min(100, timeToPercent(zStart, extent)));
    const pEnd = Math.max(0, Math.min(100, timeToPercent(zEnd, extent)));
    chart.dispatchAction({
      type: 'dataZoom',
      start: pStart,
      end: pEnd,
    });
  }

  if (props.brushRange) {
    const bStart = new Date(props.brushRange.start).getTime();
    const bEnd = new Date(props.brushRange.end).getTime();
    chart.dispatchAction({
      type: 'brush',
      command: 'takeSnapshot',
      areas: [
        {
          brushType: 'lineX',
          xAxisIndex: 0,
          coordRange: [bStart, bEnd],
        },
      ],
    });
  }
}

function onBrushEnd(params) {
  if (!params || !params.areas || params.areas.length === 0) {
    emit('brushClear');
    return;
  }
  const area = params.areas[0];
  if (area.coordRange) {
    emit('brushEnd', {
      start: new Date(area.coordRange[0]).toISOString(),
      end: new Date(area.coordRange[1]).toISOString(),
    });
  }
}

onMounted(async () => {
  await nextTick();
  if (chartRef.value) {
    chart = echarts.init(chartRef.value);
    chart.on('brushEnd', onBrushEnd);
    render();
  }
});

watch(
  () => props.curve,
  () => render(),
  { deep: true }
);

watch(
  [() => props.brushRange, () => props.highlightRange, () => props.zoomRange],
  () => render(),
  { deep: true }
);

onBeforeUnmount(() => {
  if (chart) {
    chart.dispose();
    chart = null;
  }
});

defineExpose({
  clearBrush: () => {
    if (chart) chart.dispatchAction({ type: 'brush', areas: [], command: 'clear' });
  },
  clearZoom: () => {
    if (chart) chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
  },
});
</script>

<style scoped>
.chart-container { width: 100%; height: 100%; min-height: 340px; }
</style>
