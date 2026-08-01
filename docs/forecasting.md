# Demand Forecasting: Linear vs Seasonal, and When Simple Beats ML

The forecast's job is narrow: predict peak demand per capacity unit, per region, 2–4 quarters out, with honest error bars. This doc covers model selection — deliberately biased toward simple methods — and the process discipline that matters more than the model.

## Choose the unit before the model

Forecast the unit the service saturates on: RPS for request-serving, concurrent sessions for connection-bound systems, jobs/hour × P95 job size for batch. If business metrics (MAU, orders/day) are what product can predict, build an explicit conversion: `RPS_peak ≈ MAU × sessions/user/day × requests/session × peak-to-average ratio`. Keep the conversion factors measured and versioned — they drift, and drifting silently is how forecasts go wrong while looking rigorous.

## The model ladder

Climb only when the current rung's measured error is both too large *and* the next rung demonstrably reduces it on your data.

### Rung 1 — Linear regression on the trend

Fit demand vs. time on 6–12 months of weekly peaks (fit on *peaks*, not averages — you provision for peaks). Log-transform first if growth is percentage-like (constant %/month), which it usually is; linear-on-log = exponential trend.

Good enough when: traffic is trend-dominated, seasonality is mild (< ~15 % swing), horizon ≤ 2 quarters. This describes a surprising fraction of B2B and internal workloads.

### Rung 2 — Trend + seasonal decomposition

When weekly/annual cycles are material (consumer traffic, commerce): decompose into trend × seasonal factors. Practical options, all fine:

- Classical decomposition or STL, then linear trend on the seasonally adjusted series.
- Holt-Winters (triple exponential smoothing) — handles trend + seasonality in one model.
- Prophet-style additive models — convenient for multiple seasonalities + holiday effects; treat it as a convenience wrapper, not as "ML" that changes the game.

Model annual events (Black Friday-class peaks) as explicit multipliers learned from previous years, not as things the curve should discover: `event_peak = baseline_forecast × event_multiplier`, with the multiplier's own year-over-year trend tracked separately.

### Rung 3 — ML (rarely justified)

Gradient boosting / deep models earn their keep only when *all* of these hold: many correlated exogenous drivers (pricing, campaigns, weather), lots of history, many series to forecast at once (hundreds of services — where a global model amortizes), and a team that will maintain the pipeline. For a handful of services forecast quarterly, the honest finding from most bake-offs is that Holt-Winters is within a few percent of the ML model — at zero maintenance cost and full explainability.

### Why simple wins in practice

1. **Step events dominate error, and no model sees them.** Launches, marketing, a signed enterprise deal, a deprecation. These come from *talking to product/sales monthly*, entering them as explicit adjustments with owners. An org that captures step events with linear trend beats an org running ML on statistical history alone — every time.
2. **Explainability is load-bearing.** The forecast justifies spend to leadership and drives commitment purchases. "Trend + December ×1.8 + the Acme onboarding" survives a CFO meeting; a feature-importance plot does not.
3. **The error bar matters more than the point estimate.** Provisioning uses forecast P90; simple models give you honest, easily computed prediction intervals from residuals. Complex models often produce confidently narrow intervals that historical backtesting refutes.
4. **The failure mode of simple is visible; the failure mode of ML is silent.** A linear fit through an inflection is obvious on a chart in review. A drifted feature pipeline is not.

## Process discipline (the part that actually determines quality)

- **Score every forecast.** Each quarter, compute error (MAPE and P90 absolute error) of last quarter's forecast vs. actual peaks. Publish it on the capacity review. Unscored forecasts get neither better nor trusted.
- **Backtest before switching models.** A candidate model must beat the incumbent on rolling-origin backtests over your own history — not on argument.
- **Separate organic, seasonal, and event components** in the published number, because the headroom policy consumes them differently (see `methodology.md`).
- **Forecast per region.** Global totals hide the regional skews that drive actual provisioning and evacuation math.
- **Sanity-bound everything:** forecast implies 3× growth? Check it against business plan, sales pipeline, and physical limits (marketing budget, market size) before buying capacity for it.

## Minimal toolchain

Weekly peaks from Prometheus/warehouse → a ~100-line Python notebook (pandas + statsmodels Holt-Winters) → forecast table with P50/P90 per region → committed to the capacity review repo. Resist the platform purchase until the notebook's measured error is the actual bottleneck — in most organizations it never becomes one.
