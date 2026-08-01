# Capacity Planning

Reference material for capacity planning in cloud-native systems: a demand-forecast → headroom-policy → validation methodology, load-test scripts that produce the validation data, and a quarterly review template that keeps the loop honest. Distilled from production experience running capacity for latency-sensitive services; genericized, no employer-specific data.

Autoscaling did not make capacity planning obsolete — it changed the question from "how many servers?" to "what headroom policy do we buy, and how do we know it holds?"

## Structure

```
capacity-planning/
├── docs/
│   ├── methodology.md        # The loop: demand forecast → headroom policy → validation
│   ├── headroom-policy.md    # N+1/N+2, regional evacuation math, worked examples
│   └── forecasting.md        # Linear vs seasonal models; when simple beats ML
├── k6/
│   ├── baseline-load.js      # Steady-state load profile with SLO-derived thresholds
│   └── stress-to-break.js    # Ramp-to-failure: find the knee and the ceiling
├── templates/
│   └── capacity-review.md    # Quarterly capacity review template
├── LICENSE
└── README.md
```

## Usage

**Docs:** start with `methodology.md` — the other two docs are deep dives into its first two stages.

**k6 scripts** (require [k6](https://k6.io)):

```bash
# Steady-state validation against staging at expected peak
k6 run k6/baseline-load.js -e BASE_URL=https://staging.example.org -e RPS=200

# Find the breaking point (staging or drained production cell only)
k6 run k6/stress-to-break.js -e BASE_URL=https://staging.example.org
```

Both scripts read the target from `BASE_URL` and encode thresholds so CI can fail on regression. `stress-to-break.js` is intentionally abusive — never point it at shared production.

**Template:** copy `templates/capacity-review.md` per service per quarter; the filled versions accumulate into your demand history, which feeds the next forecast.

## License

MIT — see [LICENSE](LICENSE).
