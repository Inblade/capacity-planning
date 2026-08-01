# Quarterly Capacity Review — <service> — <YYYY-Qn>

> One review per service (or tightly coupled service group), per quarter.
> Owner completes before the meeting; the meeting decides, it does not gather data.
> Keep it under 2 pages — links to dashboards, not screenshots of them.

| | |
|---|---|
| **Service / tier** | checkout-api / tier-1 |
| **Review owner** | |
| **Date / attendees** | |
| **Capacity unit** | e.g. RPS at p99 < 400 ms |
| **Regions in scope** | |

## 1. Last quarter: forecast vs. actual

| Region | Forecast P50 peak | Forecast P90 peak | Actual peak | Error (actual vs P50) |
|---|---|---|---|---|
| | | | | |

- Forecast error (MAPE, trailing 4 quarters): __
- Cause of the largest miss (organic drift / seasonal mismodel / unforecast step event): __
- Model or conversion-factor changes made as a result: __

## 2. Validation performed this quarter

| Event | Date | Result | Link |
|---|---|---|---|
| Baseline load test @ forecast peak | | pass / fail | |
| Stress-to-break (knee, ceiling) | | knee = __ , ceiling = __ | |
| Zone/region drain drill | | SLO held: yes / no | |

- Measured knee → **max-safe utilization = __ %** (previous assumption: __ %)
- Findings that are reliability bugs rather than capacity numbers (backpressure, slow recovery, dependency ceilings): __

## 3. Utilization vs. policy band

| Region | Policy band | P99 utilization (quarter) | In band? |
|---|---|---|---|
| | e.g. 45–65 % | | |

- Sustained breach above band → capacity action (section 5). Sustained breach below → right-sizing action, flagged to FinOps.

## 4. Next-quarter demand forecast

| Region | P50 peak | P90 peak | Basis (trend / seasonal / events) |
|---|---|---|---|
| | | | |

**Step events entered this quarter** (source: product/sales sync of <date>):

| Event | Est. impact | Confidence | Owner |
|---|---|---|---|
| | | | |

## 5. Headroom policy recomputation

```
required = forecast_P90 × (1 + growth_buffer) × failure_factor ÷ max_safe_util
```

| Region | forecast_P90 | growth_buffer | failure_factor | max_safe_util | Required | Provisioned | Delta |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

- Failure policy in force (zonal N+1 / regional evacuation / none): __ — last validated: __
- Quota check: cloud quotas cover required + evacuation surge in all regions: yes / no (ticket: __)

## 6. Decisions

| # | Decision (scale up/down, quota, test, fix, policy change) | Owner | Due |
|---|---|---|---|
| 1 | | | |

- Commitment-purchase implications forwarded to FinOps: yes / n-a
- Risks accepted this quarter (explicitly, with who accepted them): __

## 7. Carry-over check

Status of last review's decisions: __ of __ completed. Incomplete items and why: __
