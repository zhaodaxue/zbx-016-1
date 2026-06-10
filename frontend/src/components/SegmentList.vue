<template>
  <div class="segment-list">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="!segments || segments.length === 0" class="empty">暂无取用段数据</div>
    <div v-else class="table-wrapper">
      <table class="seg-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>舱位</th>
            <th>开始时间</th>
            <th>结束时间</th>
            <th>时长(分钟)</th>
            <th>耗水量(吨)</th>
            <th>速率(吨/h)</th>
            <th>合并</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in segments"
            :key="s.id"
            :class="['seg-row', { merged: s.merge_count > 0, selected: s.id === selectedId }]"
            @click="handleRowClick(s)"
          >
            <td class="id-cell">#{{ s.id }}</td>
            <td>
              <span :class="['tank-tag', s.tank_code === 'FRONT' ? 'front' : 'rear']">
                {{ s.tank_name }}
              </span>
            </td>
            <td>{{ formatTime(s.start_time) }}</td>
            <td>{{ formatTime(s.end_time) }}</td>
            <td class="num">{{ s.duration_minutes }}</td>
            <td class="num highlight">{{ parseFloat(s.consumed_tons).toFixed(3) }}</td>
            <td class="num">{{ s.rate_tons_per_hour?.toFixed(2) }}</td>
            <td>
              <span v-if="s.merge_count > 0" class="merge-badge" :title="`合并次数: ${s.merge_count}`">
                ×{{ s.merge_count }}
              </span>
              <span v-else class="no-merge">—</span>
            </td>
            <td>
              <button class="view-btn" @click.stop="$emit('select', s.id)">
                {{ selectedId === s.id ? '取消' : '查看' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  segments: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  selectedId: { type: [Number, String], default: null },
});
const emit = defineEmits(['select', 'toggleSelect']);

function formatTime(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function handleRowClick(segment) {
  emit('toggleSelect', segment.id);
}
</script>

<style scoped>
.segment-list { height: 100%; }
.loading, .empty {
  padding: 60px 20px;
  text-align: center;
  color: #a0aec0;
  font-size: 14px;
}
.table-wrapper { max-height: 500px; overflow-y: auto; border-radius: 8px; border: 1px solid #e2e8f0; }
.seg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.seg-table thead {
  position: sticky;
  top: 0;
  background: #f7fafc;
  z-index: 1;
}
.seg-table th {
  padding: 12px 10px;
  text-align: left;
  font-weight: 600;
  color: #4a5568;
  border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
}
.seg-table td {
  padding: 10px;
  border-bottom: 1px solid #edf2f7;
  color: #2d3748;
}
.seg-row { cursor: pointer; transition: background-color 0.15s; }
.seg-row:hover { background: #f7fafc; }
.seg-row.merged { background: #fffaf0; }
.seg-row.merged:hover { background: #feebc8; }
.seg-row.selected {
  background: #e6fffa !important;
  box-shadow: inset 3px 0 0 #38b2ac;
}
.seg-row.selected td { color: #234e52; }
.seg-row.selected:hover { background: #b2f5ea !important; }
.id-cell { color: #718096; font-family: monospace; font-size: 12px; }
.num { text-align: right; font-family: 'Consolas', monospace; }
.num.highlight { color: #2b6cb0; font-weight: 600; }
.tank-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.tank-tag.front { background: #bee3f8; color: #2c5282; }
.tank-tag.rear { background: #c6f6d5; color: #22543d; }
.merge-badge {
  display: inline-block;
  background: #f6ad55;
  color: #7c2d12;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}
.no-merge { color: #cbd5e0; }
.view-btn {
  background: #4299e1;
  color: white;
  border: none;
  padding: 5px 12px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}
.view-btn:hover { background: #3182ce; }
.seg-row.selected .view-btn { background: #ed8936; }
.seg-row.selected .view-btn:hover { background: #dd6b20; }
</style>
