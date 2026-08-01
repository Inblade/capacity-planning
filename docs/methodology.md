# Capacity Planning Methodology

Capacity planning is a loop, not a spreadsheet: **forecast demand → set a headroom policy → validate that the system actually delivers the promised capacity → feed the results back.** Any of the three stages alone gives false confidence; the loop keeps them honest.

```
        ┌────────────────────┐
        │  1. Demand forecast │  what load is coming?
        └─────────┬──────────┘
                  ▼
        ┌────────────────────┐
        │  2. Headroom policy │  how much buffer do we buy, and why?
        └─────────┬──────────┘
                  ▼
        ┌────────────────────┐
        │  3. Validation      │  does the system deliver it? (load tests,
        └─────────┬──────────┘   drain drills, utilization review)
                  │
                  └────────── findings update the model and the policy ──▶ back to 1
```

Cadence: the loop runs quarterly per service tier (see `templates/capacity-review.md`), with validation events (load tests, evacuation drills) scheduled inside the quarter.

## Stage 1 — Demand forecast

Detailed in `forecasting.md`. The outputs that matter downstream:

- **Peak demand forecast** per capacity unit (RPS, concurrent sessions, jobs/hour — pick the unit the service actually saturates on), at P50 and P90 confidence, per region, for the next 2–4 quarters.
- **Step events** that no statistical model will predict: launches, marketing pushes, migrations, a big customer onboarding. These come from talking to product and sales, and they dominate error in most real forecasts.
- **Growth attribution:** organic trend vs. seasonal vs. planned events, separated — because the headroom policy treats them differently (seasonal peaks are known and pre-provisioned; organic error is what general headroom is for).

The forecast is a document with a named owner and stated assumptions, reviewed against actuals every quarter. A forecast nobody scores against reality is astrology.

## Stage 2 — Headroom policy

Detailed in `headroom-policy.md`. The forecast says what's coming; the policy says how much capacity above it you deliberately hold, and for which reasons:

```
required_capacity(region) =
    forecast_P90_peak(region)
    × (1 + growth_buffer)          # forecast error allowance until next review
    × failure_headroom_factor      # N+1 / evacuation — see headroom-policy.md
    ÷ max_safe_utilization         # the knee: beyond this, latency SLOs break
```

Each factor is owned and justified separately. The most commonly missing number is `max_safe_utilization` — the utilization level beyond which latency degrades unacceptably. It cannot be reasoned about from first principles; it is measured, which is what Stage 3 is for.

## Stage 3 — Validation

A capacity number that has never been tested is a hypothesis. Three validation mechanisms, in increasing order of realism:

1. **Load testing** (`k6/` in this repo):
   - *Baseline test* at forecast peak: confirms SLOs hold at the load you claim to support. Run on every significant release of tier-1 services, and at minimum quarterly.
   - *Stress-to-break test*: finds the actual knee (where latency departs) and ceiling (where errors begin). The knee, divided into current provisioned capacity, is your real `max_safe_utilization` — not the 70 % someone wrote down two years ago.
2. **Drain drills:** evacuate a zone (later, a region) at a low-traffic hour and observe whether the surviving capacity absorbs the shift within SLO. This validates the failure-headroom factor with real traffic — load tests can't fully model cache warmup, connection re-balancing, and autoscaler reaction time.
3. **Continuous utilization review:** weekly automated report of P99 utilization vs. the policy band per service. Persistent breach in either direction is a finding: above band → capacity risk; far below band → money being burned (hand this to the FinOps loop).

### Validation rules

- Test the **system**, not the pod: dependencies, databases, and rate limiters are usually the real ceiling. A service that scales linearly to 10× on stubs and dies at 2× on its real database has 2× capacity.
- Re-validate after **architecture changes**, not just on the calendar — a new caching layer or a database migration invalidates the old knee.
- Every validation produces a written result attached to the quarterly review, including "we tried to break it and couldn't past X" — the ceiling you know is an asset.

## Feeding back

The quarterly review (see template) closes the loop explicitly:

- Forecast vs. actual → adjusts the forecasting model and the growth buffer.
- Measured knee vs. assumed `max_safe_utilization` → adjusts the policy denominator.
- Drill results → adjust the failure-headroom factor or fix what failed.
- Resulting capacity plan → feeds commitment purchasing (the FinOps commitment ladder) and hardware/quota lead times.

## Failure modes

- **Spreadsheet capacity planning:** forecasts produced annually, never validated, never scored. The loop degenerates into Stage 1 alone.
- **Autoscaling as a substitute:** autoscalers redistribute provisioned capacity quickly; they do not conjure regional capacity during an AZ loss, warm caches, or raise database ceilings. The policy still has to buy the headroom.
- **Peak-of-peaks paranoia:** provisioning every region for the sum of all worst cases simultaneously. The policy exists precisely to make the accepted-risk level explicit instead of infinite.
- **Load-test theater:** testing an idealized endpoint at happy-path payloads. Test the top real user journeys with production-shaped data, or the knee you find is fiction.
