# Headroom Policy

Headroom is capacity you deliberately hold above forecast peak. This doc defines the standard failure-tolerance policies (N+1, N+2), works through the regional evacuation math, and shows how the numbers combine into a provisioning target.

## Definitions

- **N** — the capacity required to serve forecast P90 peak *within latency SLO* (i.e., already divided by max-safe utilization; see below).
- **Failure domain** — the unit whose loss you plan for: an availability zone, a cluster, or a region, depending on the tier.
- **N+1 / N+2** — provisioning such that the loss of 1 (or 2) failure domains leaves ≥ N available.

## Max-safe utilization comes first

Headroom math is meaningless against nameplate capacity. Queueing behavior means latency degrades non-linearly as utilization approaches saturation; the *knee* — where P99 latency departs from flat — is the real limit. Measured knees for typical request-serving services land at 60–80 % of saturation throughput; measure yours with `k6/stress-to-break.js` rather than adopting a folk number.

```
usable_capacity = provisioned_capacity × max_safe_utilization
```

All headroom formulas below operate on usable capacity.

## Zonal N+1 (the default for tier-1 and tier-2)

Spread across `z` zones, surviving one zone loss at peak:

```
per_zone_capacity ≥ N / (z − 1)
total_provisioned = z × per_zone_capacity ≥ N × z/(z−1)
```

| Zones | Overhead for N+1 |
|---|---|
| 2 | +100 % |
| 3 | +50 % |
| 4 | +33 % |

This is why 3 zones is the standard: 2-zone N+1 costs as much as doubling, and beyond 4 zones the marginal saving rarely justifies the operational spread. **N+2 (or N+1 during maintenance)**: if you patch/drain one zone at a time, a single-zone failure during maintenance is an N−2 event. For tier-1 services either provision `N × z/(z−2)` or — usually cheaper — forbid concurrent maintenance and accept the brief exposure explicitly in writing.

## Regional evacuation math (tier-1, multi-region)

Policy question: **if region R dies at global peak, do the survivors absorb its traffic within SLO?**

Worked example — three regions serving forecast P90 peaks:

```
eu-west-1:   40 kRPS
us-east-1:   35 kRPS
ap-south-1:  15 kRPS
global peak: 90 kRPS   (assume coincident peaks — conservative; check your traffic)
```

Worst case is losing the largest region (eu-west-1). Its 40 kRPS re-routes by the failover policy — say latency-based routing sends 70 % to us-east-1, 30 % to ap-south-1:

```
us-east-1 must serve:  35 + 0.70 × 40 = 63 kRPS
ap-south-1 must serve: 15 + 0.30 × 40 = 27 kRPS
```

With a measured max-safe utilization of 0.70, required provisioned capacity:

```
us-east-1:  63 / 0.70 = 90 kRPS provisioned  (vs 50 for its own peak alone)
ap-south-1: 27 / 0.70 ≈ 39 kRPS provisioned
```

Points the example illustrates:

- **Evacuation headroom dwarfs zonal headroom.** us-east-1 carries 80 % extra provisioned capacity for a failure that may never happen. This is the single biggest line item in tier-1 capacity cost — which is why it must be an explicit, leadership-approved policy, not an engineering default.
- **Failover distribution is a design choice.** Weighted routing that spreads the evacuated load evenly reduces the worst single region's requirement. So does degrading gracefully: an agreed load-shedding tier ("during regional failover, feature X is disabled") can legitimately reduce the evacuated load in the equation — if it's actually implemented and tested.
- **Coincident-peak assumption:** if regional peaks don't overlap (follow-the-sun traffic), use the *actual* co-occurring loads, not the sum of independent peaks. This routinely saves 20–30 % and only requires looking at the data.
- **Autoscaling counts only up to quota and warm-up.** Scale-out during an evacuation is limited by cloud quotas, instance availability, image pull, and cache warmup. Count as evacuation capacity only what comes up within your SLO's tolerance window (typically minutes); pre-provision or pre-warm the rest.

**Validation:** the math above is a claim. Drain drills (shift real traffic away from a region at controlled hours, quarterly for tier-1) are the proof — see `methodology.md` Stage 3.

## Choosing the policy per tier

| Tier | Policy | Rationale |
|---|---|---|
| Tier-1 (revenue/user-critical) | Regional evacuation + zonal N+1 within regions | Region loss must be survivable within SLO |
| Tier-2 | Zonal N+1, single region (or active/passive with relaxed RTO) | Zone loss survivable; region loss = accepted degradation |
| Tier-3 (internal, batch) | Best-effort; queue and catch up | Buying headroom for delayable work is waste |

Batch/async workloads deserve special mention: their "headroom" is *time*, not capacity. A queue that drains within the freshness SLA after an outage needs no standby compute at all — moving work from tier-1 synchronous paths to tier-3 queues is often the cheapest capacity strategy available.

## Growth buffer and review

On top of failure headroom, hold a growth buffer covering forecast error until the next review: `(1 + growth_buffer)` with the buffer sized from your historical forecast error (start at P90 absolute percentage error; tighten as forecasts prove out). The quarterly review (see `templates/capacity-review.md`) re-derives every factor from fresh measurements — a headroom policy older than two quarters is a rumor.
