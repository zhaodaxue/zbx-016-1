<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';

const props = defineProps({
  curve: { type: Object, default: () => ({ FRONT: { data: [] }, REAR: { data: [] } }) },
});

const chartRef = ref(null);
let chart = null;
let resizeObserver = null;

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

function render() {
  if (!chart) return;
  const frontData = transformData(props.curve.FRONT?.data || []);
  const rearData = transformData(props.curve.REAR?.data || []);
  const frontValve = getValveMarkPoints(props.curve.FRONT?.data || [], '前舱');
  const rearValve = getValveMarkPoints(props.curve.REAR?.data || [], '后舱');

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26,32,44,0.9)',
      borderColor: 'transparent',
      textStyle: { color: '#fff' },
      formatter: function (params) {
        const t = new Date(params[0].axisValue);
        let html = `<div style="font-weight:600;margin-bottom:6px">${t.toLocaleString('zh-CN')}</div>`;
        for (const p of params) {
          html += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
            <span>${p.seriesName}:</span>
            <span style="font-weight:600">${p.value[1].toFixed(3)} 吨</span>
          </div>`;
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
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
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
    ],
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
}

onMounted(async () => {
  await nextTick();
  if (chartRef.value) {
    chart = echarts.init(chartRef.value);
    render();
  }
});

watch(
  () => props.curve,
  () => render(),
  { deep: true }
);

onBeforeUnmount(() => {
  if (chart) {
    chart.dispose();
    chart = null;
  }
});
</script>

<style scoped>
.chart-container { width: 100%; height: 100%; min-height: 340px; }
</style>
