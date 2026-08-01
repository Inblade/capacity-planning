// Stress-to-break: ramp offered load in steps until the service breaks,
// to find (a) the knee — where p99 latency departs from flat — and
// (b) the ceiling — where errors exceed tolerance.
//
//   knee / provisioned_capacity  =>  measured max-safe utilization
//   (see docs/headroom-policy.md)
//
// Usage:
//   k6 run stress-to-break.js -e BASE_URL=https://staging.example.org \
//       -e START_RPS=50 -e STEP_RPS=50 -e STEPS=10
//
// WARNING: intentionally abusive. Run only against staging or a drained,
// isolated production cell, with the owning team aware and dependencies
// (payment providers etc.) stubbed or sandboxed.

import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const START_RPS = Number(__ENV.START_RPS) || 50;
const STEP_RPS = Number(__ENV.STEP_RPS) || 50;
const STEPS = Number(__ENV.STEPS) || 10;
const STEP_DURATION = __ENV.STEP_DURATION || '3m';

const errorRate = new Rate('stress_errors');

// Build a staircase: hold each load level long enough for autoscaling and
// queues to reach steady state before judging the level. 3m per step is a
// floor, not a suggestion — shorter steps measure transients.
function buildStages() {
  const stages = [];
  for (let i = 1; i <= STEPS; i++) {
    const target = START_RPS + STEP_RPS * (i - 1);
    stages.push({ target: target, duration: '30s' }); // ramp to level
    stages.push({ target: target, duration: STEP_DURATION }); // hold level
  }
  stages.push({ target: 0, duration: '1m' }); // ramp down: observe recovery
  return stages;
}

const MAX_RPS = START_RPS + STEP_RPS * (STEPS - 1);

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: START_RPS,
      timeUnit: '1s',
      preAllocatedVUs: MAX_RPS * 2,
      maxVUs: MAX_RPS * 6,
      stages: buildStages(),
      gracefulStop: '30s',
    },
  },
  thresholds: {
    // abortOnFail stops the test once the system is truly broken, so we
    // don't hammer a downed service for another 20 minutes. The delay lets
    // one bad scrape interval pass without aborting.
    stress_errors: [
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '1m' },
    ],
    http_req_duration: [
      { threshold: 'p(99)<2000', abortOnFail: true, delayAbortEval: '1m' },
    ],
  },
  tags: { test_type: 'stress', service: 'checkout-api' },
};

export default function () {
  // Single hottest journey at production-shaped payloads. Stress tests use
  // the dominant path: the knee of the whole mix is gated by it, and a
  // one-path staircase makes the resulting latency-vs-load curve readable.
  const res = http.get(`${BASE_URL}/api/v1/products?page=1&size=20`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'latency sane': (r) => r.timings.duration < 5000,
  });
  errorRate.add(!ok);
}

// Analysis notes (post-run):
// 1. Export per-interval p99 and RPS (k6 --out json, or the Prometheus
//    remote-write output) and plot latency vs offered load.
// 2. Knee = the load level where p99 departs from its flat baseline by
//    >20% for two consecutive intervals. Record it in the capacity review.
// 3. Ceiling = the level where stress_errors first exceeded 1% sustained.
// 4. Watch the ramp-down tail: a system whose latency does NOT recover
//    promptly after load drops has a queueing/backpressure problem that
//    headroom cannot fix — file it as a reliability finding, not a
//    capacity number.
export function handleSummary(data) {
  return {
    stdout: JSON.stringify(
      {
        test: 'stress-to-break',
        max_offered_rps: MAX_RPS,
        aborted_early: data.metrics.stress_errors
          ? data.metrics.stress_errors.values.rate >= 0.05
          : false,
        p99_ms_overall: data.metrics.http_req_duration
          ? data.metrics.http_req_duration.values['p(99)']
          : null,
        error_rate_overall: data.metrics.stress_errors
          ? data.metrics.stress_errors.values.rate
          : null,
      },
      null,
      2
    ),
    'summary-stress.json': JSON.stringify(data, null, 2),
  };
}
