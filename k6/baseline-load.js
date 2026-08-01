// Baseline load test: validate that the system holds the forecast peak
// within SLO. Runs a constant-arrival-rate profile (open model) so that
// response-time degradation cannot silently throttle offered load, plus a
// realistic user-journey mix rather than a single endpoint.
//
// Usage:
//   k6 run baseline-load.js -e BASE_URL=https://staging.example.org -e RPS=200
//
// Thresholds are derived from the service SLO (p99 < 400 ms, availability
// 99.9%) with a small validation margin. CI treats a threshold breach as a
// capacity regression and fails the run (k6 exits non-zero).

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const TARGET_RPS = Number(__ENV.RPS) || 100;

// Journey-level custom metrics: per-journey visibility beats one blended
// latency number when diagnosing which path regressed.
const checkoutLatency = new Trend('journey_checkout_duration', true);
const browseLatency = new Trend('journey_browse_duration', true);
const errorRate = new Rate('journey_errors');

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: '30m', // long enough to expose slow leaks and cache churn
      preAllocatedVUs: Math.ceil(TARGET_RPS * 2),
      maxVUs: Math.ceil(TARGET_RPS * 5),
      gracefulStop: '30s',
    },
  },
  thresholds: {
    // SLO: p99 < 400ms — validate with margin at 350ms; also gate p95.
    http_req_duration: ['p(95)<250', 'p(99)<350'],
    // SLO: 99.9% availability — allow at most 0.1% failed requests.
    http_req_failed: ['rate<0.001'],
    journey_errors: ['rate<0.001'],
    journey_checkout_duration: ['p(99)<500'],
    journey_browse_duration: ['p(99)<300'],
    // Guard against silent under-delivery of offered load: if dropped
    // iterations appear, VU allocation or the target is saturating.
    dropped_iterations: ['count<100'],
  },
  tags: { test_type: 'baseline', service: 'checkout-api' },
};

const HEADERS = { 'Content-Type': 'application/json' };

// Traffic mix from production access-log analysis: keep these weights in
// sync with reality or the test validates a fictional workload.
const JOURNEY_WEIGHTS = [
  { weight: 0.7, fn: browseJourney },
  { weight: 0.25, fn: searchJourney },
  { weight: 0.05, fn: checkoutJourney },
];

function pickJourney() {
  const r = Math.random();
  let acc = 0;
  for (const j of JOURNEY_WEIGHTS) {
    acc += j.weight;
    if (r <= acc) return j.fn;
  }
  return JOURNEY_WEIGHTS[0].fn;
}

function browseJourney() {
  group('browse', () => {
    const res = http.get(`${BASE_URL}/api/v1/products?page=1&size=20`, {
      headers: HEADERS,
      tags: { journey: 'browse' },
    });
    browseLatency.add(res.timings.duration);
    const ok = check(res, {
      'browse: status 200': (r) => r.status === 200,
      'browse: has items': (r) => {
        try {
          return JSON.parse(r.body).items.length > 0;
        } catch (e) {
          return false;
        }
      },
    });
    errorRate.add(!ok);
  });
}

function searchJourney() {
  group('search', () => {
    const terms = ['laptop', 'monitor', 'keyboard', 'headset', 'dock'];
    const q = terms[Math.floor(Math.random() * terms.length)];
    const res = http.get(`${BASE_URL}/api/v1/search?q=${q}`, {
      headers: HEADERS,
      tags: { journey: 'search' },
    });
    const ok = check(res, { 'search: status 200': (r) => r.status === 200 });
    errorRate.add(!ok);
  });
}

function checkoutJourney() {
  group('checkout', () => {
    const cart = http.post(
      `${BASE_URL}/api/v1/cart`,
      JSON.stringify({ sku: `SKU-${1000 + Math.floor(Math.random() * 9000)}`, qty: 1 }),
      { headers: HEADERS, tags: { journey: 'checkout' } }
    );
    const cartOk = check(cart, { 'cart: status 201': (r) => r.status === 201 });

    let checkoutOk = false;
    if (cartOk) {
      let cartId = null;
      try {
        cartId = JSON.parse(cart.body).id;
      } catch (e) {
        cartId = null;
      }
      if (cartId) {
        const res = http.post(
          `${BASE_URL}/api/v1/checkout`,
          JSON.stringify({ cartId: cartId, paymentMethod: 'test-card' }),
          { headers: HEADERS, tags: { journey: 'checkout' } }
        );
        checkoutLatency.add(res.timings.duration);
        checkoutOk = check(res, { 'checkout: status 200': (r) => r.status === 200 });
      }
    }
    errorRate.add(!(cartOk && checkoutOk));
  });
}

export default function () {
  pickJourney()();
  // Small think-time so a single VU doesn't hot-loop one connection;
  // arrival rate (not VU count) governs offered load in this executor.
  sleep(Math.random() * 0.5);
}

export function handleSummary(data) {
  // Machine-readable summary for the capacity review record.
  return {
    stdout: JSON.stringify(
      {
        test: 'baseline-load',
        target_rps: TARGET_RPS,
        p95_ms: data.metrics.http_req_duration
          ? data.metrics.http_req_duration.values['p(95)']
          : null,
        p99_ms: data.metrics.http_req_duration
          ? data.metrics.http_req_duration.values['p(99)']
          : null,
        error_rate: data.metrics.http_req_failed
          ? data.metrics.http_req_failed.values.rate
          : null,
      },
      null,
      2
    ),
    'summary-baseline.json': JSON.stringify(data, null, 2),
  };
}
