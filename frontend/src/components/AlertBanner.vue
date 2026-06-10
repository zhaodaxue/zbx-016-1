<template>
  <div class="alert-banner" v-if="activeAlerts.length > 0">
    <div class="alert-scroll">
      <div
        class="alert-item"
        v-for="a in activeAlerts"
        :key="a.id"
        :class="{ active: a.id === activeSelectedId }"
        @click="handleClick(a)"
      >
        <span class="alert-icon">⚠️</span>
        <span class="alert-type">{{ a.alert_label || '告警' }}</span>
        <span class="alert-desc">
          {{ a.tank_code ? (a.tank_code === 'FRONT' ? '前舱' : '后舱') + ' · ' : '' }}
          自 {{ formatTime(a.start_time) }} 起
          <template v-if="a.end_time"> · 已结束于 {{ formatTime(a.end_time) }}</template>
        </span>
        <span v-if="a.detail && a.detail.start_ratio" class="alert-ratio">
          速率比: {{ parseFloat(a.detail.start_ratio).toFixed(2) }}x
        </span>
      </div>
    </div>
    <div class="alert-count" v-if="resolvedAlerts.length > 0">
      历史告警 {{ resolvedAlerts.length }} 条
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  alerts: { type: Array, default: () => [] },
  activeSelectedId: { type: [Number, String], default: null },
});

const emit = defineEmits(['selectAlert']);

const activeAlerts = computed(() => props.alerts.filter((a) => a.is_active));
const resolvedAlerts = computed(() => props.alerts.filter((a) => !a.is_active));

function formatTime(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function handleClick(alert) {
  emit('selectAlert', alert);
}
</script>

<style scoped>
.alert-banner {
  background: linear-gradient(90deg, #fed7d7, #feb2b2);
  border-left: 6px solid #c53030;
  padding: 10px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.alert-scroll {
  display: flex;
  gap: 32px;
  flex: 1;
  overflow-x: auto;
  padding: 4px 0;
}
.alert-item {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  color: #742a2a;
  font-size: 14px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.alert-item:hover {
  background: rgba(197, 48, 48, 0.15);
}
.alert-item.active {
  background: rgba(197, 48, 48, 0.28);
  box-shadow: 0 0 0 2px rgba(197, 48, 48, 0.4);
}
.alert-icon { font-size: 16px; }
.alert-type {
  background: #c53030;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.alert-ratio {
  background: rgba(197, 48, 48, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.alert-count {
  background: rgba(197, 48, 48, 0.12);
  color: #742a2a;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}
</style>
