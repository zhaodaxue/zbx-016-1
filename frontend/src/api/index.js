import axios from 'axios';

const baseURL = (import.meta.env.VITE_API_BASE) || '';
const api = axios.create({
  baseURL,
  timeout: 15000,
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    console.error('API Error:', err);
    return Promise.reject(err);
  }
);

export function getLevelCurve(startTime, endTime) {
  return api.get('/api/query/level-curve', { params: { start_time: startTime, end_time: endTime } });
}

export function getSegments(params) {
  return api.get('/api/query/segments', { params });
}

export function getSegmentDetail(id) {
  return api.get(`/api/query/segments/${id}`);
}

export function getAlerts(includeInactive) {
  return api.get('/api/query/alerts', { params: { include_inactive: includeInactive } });
}

export function getOverview(hours) {
  return api.get('/api/query/overview', { params: { hours } });
}

export function runAggregation(tankCode) {
  return api.post('/api/aggregation/run', { tank_code: tankCode });
}

export function evaluateAlerts() {
  return api.post('/api/alerts/evaluate');
}

export default api;
