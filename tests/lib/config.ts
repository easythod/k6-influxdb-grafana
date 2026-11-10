import type { Options, Scenario } from 'k6/options';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const CREDENTIALS = {
  username: __ENV.API_USERNAME || 'admin',
  password: __ENV.API_PASSWORD || 'password123',
};

// Load profiles. Pick one with PROFILE=<name>; smoke is the default.
// Arrival-rate executors keep throughput fixed regardless of response time,
// so a slowing system shows up as latency growth instead of a silent RPS drop.
const profiles: Record<string, Scenario> = {
  smoke: {
    executor: 'constant-arrival-rate',
    rate: 1,
    timeUnit: '1s',
    duration: '30s',
    preAllocatedVUs: 2,
  },
  load: {
    executor: 'ramping-arrival-rate',
    startRate: 1,
    timeUnit: '1s',
    preAllocatedVUs: 10,
    maxVUs: 50,
    stages: [
      { target: 10, duration: '1m' },
      { target: 10, duration: '3m' },
      { target: 0, duration: '30s' },
    ],
  },
  stress: {
    executor: 'ramping-arrival-rate',
    startRate: 1,
    timeUnit: '1s',
    preAllocatedVUs: 20,
    maxVUs: 200,
    stages: [
      { target: 20, duration: '1m' },
      { target: 40, duration: '2m' },
      { target: 60, duration: '2m' },
      { target: 0, duration: '30s' },
    ],
  },
  spike: {
    executor: 'ramping-arrival-rate',
    startRate: 2,
    timeUnit: '1s',
    preAllocatedVUs: 20,
    maxVUs: 200,
    stages: [
      { target: 2, duration: '30s' },
      { target: 50, duration: '10s' },
      { target: 50, duration: '30s' },
      { target: 2, duration: '10s' },
      { target: 2, duration: '30s' },
    ],
  },
};

export const PROFILE = __ENV.PROFILE || 'smoke';

export function buildOptions(): Options {
  const scenario = profiles[PROFILE];
  if (!scenario) {
    throw new Error(`Unknown PROFILE "${PROFILE}". Use one of: ${Object.keys(profiles).join(', ')}`);
  }

  return {
    scenarios: { [PROFILE]: scenario },
    // Service level objectives. A breached threshold makes k6 exit with code 99, which fails CI.
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<500', 'p(99)<1000'],
      'http_req_duration{name:POST /booking}': ['p(95)<600'],
      checks: ['rate>0.99'],
      // Abort early instead of hammering a service that is already broken.
      [`http_req_failed{scenario:${PROFILE}}`]: [{ threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '10s' }],
    },
  };
}
