const { performance } = require('node:perf_hooks');
const { resolve } = require('node:path');
const { config } = require('dotenv');

config({ path: resolve(__dirname, '..', '.env') });

const SAMPLE_COUNT = 100;
const P95_LIMIT_MS = 500;
const API_BASE_URL = (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
const EMAIL = process.env.LICENSING_PERF_EMAIL || 'veterinarian@vetlinx.local';
const PASSWORD = process.env.LICENSING_PERF_PASSWORD || 'VetLinX-Local-2026!';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${path} returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return response;
}

async function main() {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = await login.json();
  if (!session.accessToken) throw new Error('Authentication succeeded without an access token');

  const cataloguePath = '/api/v1/licensing/pathways?jurisdictionCode=AE&licenceTypeCode=VETERINARIAN';
  await request(cataloguePath, { headers: { authorization: `Bearer ${session.accessToken}` } });

  const durations = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const startedAt = performance.now();
    await request(cataloguePath, { headers: { authorization: `Bearer ${session.accessToken}` } });
    durations.push(performance.now() - startedAt);
  }
  durations.sort((a, b) => a - b);
  const percentile = (value) => durations[Math.ceil((value / 100) * durations.length) - 1];
  const summary = {
    samples: durations.length,
    successRate: '100%',
    p50Ms: Number(percentile(50).toFixed(2)),
    p95Ms: Number(percentile(95).toFixed(2)),
    maxMs: Number(durations.at(-1).toFixed(2)),
    thresholdMs: P95_LIMIT_MS,
  };
  console.table(summary);
  if (summary.p95Ms > P95_LIMIT_MS) {
    throw new Error(`Licensing catalogue p95 ${summary.p95Ms} ms exceeds ${P95_LIMIT_MS} ms`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
