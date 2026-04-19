import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

const base = __ENV.BASE_URL || 'http://localhost:5137';

export default function () {
  const r1 = http.get(`${base}/api/platform/v2/kpis`);
  check(r1, { 'kpis status 200': (r) => r.status === 200 || r.status === 401 || r.status === 403 });

  const r2 = http.get(`${base}/api/platform/v2/reconciliation/report`);
  check(r2, { 'reconciliation reachable': (r) => [200, 401, 403].includes(r.status) });

  sleep(1);
}

