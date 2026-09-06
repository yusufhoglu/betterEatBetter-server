# Monitoring — dietician wait-time metrics via Grafana Cloud

This is **Plan B** from the latency investigation: real Prometheus metrics
(averages, percentiles, alerting) for how long users wait on the dietician chat,
shipped to the **Grafana Cloud** account that already receives the logs
(`LOKI_URL=https://logs-prod-012.grafana.net`).

If you only want a quick look and not a full pipeline, skip this whole doc and use
the Loki log line instead — see [§9 Plan A fallback](#9-plan-a-fallback-no-new-infra).

---

## 0. How the pieces fit

```
                          VPS (161.97.111.192)
┌───────────────────────────────────────────────────────────────┐
│  compose project: food-tracker                                 │
│    app  ──listens──►  172.17.0.1:3100  (= host.docker.internal)│
│                         │  GET /metrics  (Bearer METRICS_TOKEN)│
│                         ▼                                       │
│  compose project: eatbetter-alloy                              │
│    grafana/alloy  ──scrapes every 30s──┐                       │
└────────────────────────────────────────┼──────────────────────┘
                                         │ remote_write (HTTPS + basic auth)
                                         ▼
                     Grafana Cloud Prometheus  ──►  Grafana dashboards / alerts
```

- The app **exposes** metrics at `GET /metrics`. It never pushes.
- **Grafana Alloy** (a tiny agent, run as its own compose project — same pattern
  as the host Caddy) scrapes that endpoint on the VPS over plain HTTP and
  `remote_write`s to Grafana Cloud.
- Grafana Cloud stores them; you build panels with **PromQL**.
- Counters reset to 0 every deploy — that's normal, every query uses `rate()`.

**What the app already ships today:** logs, via `pino-loki` directly from the
process (no agent). This doc adds a metrics path alongside it and does **not**
touch logging.

---

## 1. Gather the Grafana Cloud details (5 min, one time)

Log in at <https://grafana.com> → your stack → **Prometheus** → *Send Metrics* /
*Details*. Copy:

| Value | Looks like | Used as |
|---|---|---|
| Remote write endpoint | `https://prometheus-prod-XX-prod-YY.grafana.net/api/prom/push` | `GC_PROM_URL` |
| Username / Instance ID | `1234567` (a number) | `GC_PROM_USER` |
| Password (API token) | a long token | `GC_PROM_TOKEN` |

For the password, create a token scoped to write metrics:
**Grafana Cloud → Administration → Access Policies → Create access policy**
- Realm: your stack
- Scopes: `metrics:write` (that's all that's needed for pushing)
- Then **Add token** under that policy, copy it once.

> Your existing `GRAFANA_CLOUD_TOKEN` may already have `metrics:write`. Check its
> access policy — if it does, reuse it and skip creating a new one.

The **querying** side needs nothing: your Grafana Cloud instance already has a
Prometheus data source provisioned (usually named `grafanacloud-<stack>-prom`).

---

## 2. Turn on the `/metrics` endpoint

The endpoint is **off by default** — it returns `404` until `METRICS_TOKEN` is
set, then `401` unless the caller sends `Authorization: Bearer <that token>`
(timing-safe compare). Code: [`src/http/metricsRoutes.ts`](src/http/metricsRoutes.ts).

1. Generate a token locally:
   ```bash
   openssl rand -hex 32
   ```
2. On the VPS, add it to the **app** env file
   (`/app/food-tracker/betterEatBetter-server/.env`):
   ```
   METRICS_TOKEN=<the value from step 1>
   ```
3. Redeploy the app so it picks up the new env var:
   ```bash
   cd /app/food-tracker/betterEatBetter-server
   docker compose -f docker-compose.prod.yml up -d
   ```
   (or just `git push` — CI redeploys.)
4. Verify from the VPS shell:
   ```bash
   TOKEN=$(grep '^METRICS_TOKEN=' .env | cut -d= -f2-)
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/metrics
   # expect: 200
   curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/metrics | grep dietician_turn
   # expect: dietician_turn_* HELP/TYPE lines
   ```
   `404` → `METRICS_TOKEN` not in the env the container actually sees (redeploy).
   `401` → token mismatch.

---

## 3. Block `/metrics` at the public edge (recommended)

Alloy scrapes locally (`http://host.docker.internal:3100`), so the endpoint never
needs to be public. The host Caddy currently proxies **all** paths, which means
`https://foodtracker.hembul.com/metrics` is reachable (token-gated, but still).
Shut it at the edge — append to the site block in `/app/backend/deploy/Caddyfile`:

```caddyfile
foodtracker.hembul.com {
    encode gzip

    @metrics path /metrics /metrics/*
    respond @metrics 404

    reverse_proxy host.docker.internal:3100
}
```

Reload:
```bash
docker exec matcher-prod-caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## 4. Deploy Grafana Alloy (its own compose project)

Mirrors how the host Caddy runs — separate project, not part of `food-tracker`,
so CI's `--remove-orphans` never touches it.

### 4.1 Create the directory on the VPS

```bash
mkdir -p /app/food-tracker/alloy && cd /app/food-tracker/alloy
```

### 4.2 `config.alloy`

```alloy
// Scrape the app's Prometheus endpoint on this host.
prometheus.scrape "eatbetter_backend" {
  targets = [
    { __address__ = "host.docker.internal:3100", job = "eatbetter-backend" },
  ]
  metrics_path    = "/metrics"
  scheme          = "http"
  scrape_interval = "30s"

  authorization {
    type        = "Bearer"
    credentials = sys.env("METRICS_TOKEN")
  }

  forward_to = [prometheus.remote_write.grafanacloud.receiver]
}

// Ship to Grafana Cloud Prometheus.
prometheus.remote_write "grafanacloud" {
  endpoint {
    url = sys.env("GC_PROM_URL")
    basic_auth {
      username = sys.env("GC_PROM_USER")
      password = sys.env("GC_PROM_TOKEN")
    }
  }
}
```

### 4.3 `docker-compose.yml`

```yaml
name: eatbetter-alloy

services:
  alloy:
    image: grafana/alloy:latest
    restart: unless-stopped
    command:
      - run
      - /etc/alloy/config.alloy
      - --storage.path=/var/lib/alloy/data
      # Alloy debug UI on the VPS loopback only:
      - --server.http.listen-addr=127.0.0.1:12345
    ports:
      - "127.0.0.1:12345:12345"
    extra_hosts:
      - "host.docker.internal:host-gateway"   # -> 172.17.0.1, where the app listens
    env_file: .env
    volumes:
      - ./config.alloy:/etc/alloy/config.alloy:ro
      - alloy_data:/var/lib/alloy/data

volumes:
  alloy_data:
```

### 4.4 `.env` (in `/app/food-tracker/alloy/`)

```
METRICS_TOKEN=<same value you put in the app .env>
GC_PROM_URL=https://prometheus-prod-XX-prod-YY.grafana.net/api/prom/push
GC_PROM_USER=1234567
GC_PROM_TOKEN=<the metrics:write token from §1>
```

```bash
chmod 600 .env
```

### 4.5 Start it

```bash
docker compose up -d
docker compose logs -f alloy   # Ctrl-C to stop tailing
```

Healthy startup logs mention the scrape target and show no `remote_write` errors.

---

## 5. Verify the pipeline end to end

Three checkpoints, in order:

1. **Alloy is scraping** — on the VPS:
   ```bash
   curl -s localhost:12345/api/v0/web/components | grep -o '"health":[^,]*' | sort -u
   ```
   or open an SSH tunnel `ssh -N -L 12345:localhost:12345 root@161.97.111.192`
   and visit <http://localhost:12345> — the component graph should be all green.

2. **Grafana Cloud is receiving** — in Grafana Cloud → **Explore** → Prometheus
   data source:
   ```promql
   up{job="eatbetter-backend"}
   ```
   (if nothing matches, try `up{job=~"eatbetter.*"}` — the job label comes from
   the target in `config.alloy`.)
   `1` = scrape succeeding. `0` = Alloy reaching Grafana Cloud but the app scrape
   failing (check `METRICS_TOKEN` match). No series at all = `remote_write`
   failing (check `GC_PROM_*`, see §8).

3. **Dietician data is flowing** — send a few messages in the app, wait ~1 min:
   ```promql
   sum(dietician_turn_ttfb_seconds_count)
   ```
   Should be > 0 and climbing. (It stays empty until at least one turn completes
   after Alloy started — the counters don't exist before the first observation.)

---

## 6. Build the dashboard

Grafana Cloud → **Dashboards → New → New dashboard → Add visualization** →
Prometheus data source. Use `$__rate_interval` so panels stay correct at any
zoom. Panels worth having:

**User wait — p50 / p95 / p99 time to first token**
```promql
histogram_quantile(0.50, sum(rate(dietician_turn_ttfb_seconds_bucket[$__rate_interval])) by (le))
histogram_quantile(0.95, sum(rate(dietician_turn_ttfb_seconds_bucket[$__rate_interval])) by (le))
histogram_quantile(0.99, sum(rate(dietician_turn_ttfb_seconds_bucket[$__rate_interval])) by (le))
```

**Average wait**
```promql
sum(rate(dietician_turn_ttfb_seconds_sum[$__rate_interval]))
/
sum(rate(dietician_turn_ttfb_seconds_count[$__rate_interval]))
```

**Wait split by lane** (smalltalk vs assisted)
```promql
histogram_quantile(0.95, sum(rate(dietician_turn_ttfb_seconds_bucket[$__rate_interval])) by (le, lane))
```

**Where the time goes — average seconds per stage** (stacked bars; `prep` =
classify+context lookup, `gather` = tool loop, `stream` = generating the answer)
```promql
sum(rate(dietician_turn_duration_seconds_sum{stage=~"prep|gather|stream"}[$__rate_interval])) by (stage)
/
sum(rate(dietician_turn_duration_seconds_count{stage=~"prep|gather|stream"}[$__rate_interval])) by (stage)
```

**Total turn time p95** (includes the post-answer digest wait)
```promql
histogram_quantile(0.95, sum(rate(dietician_turn_duration_seconds_bucket{stage="total"}[$__rate_interval])) by (le))
```

**Throughput — turns per minute**
```promql
sum(rate(dietician_turn_ttfb_seconds_count[$__rate_interval])) * 60
```

**Error ratio** (`outcome` is `ok`, `STREAM_INTERRUPTED`, `LLM_RATE_LIMITED`, …)
```promql
sum(rate(dietician_turn_ttfb_seconds_count{outcome!="ok"}[$__rate_interval]))
/
sum(rate(dietician_turn_ttfb_seconds_count[$__rate_interval]))
```

**Errors by kind**
```promql
sum(rate(dietician_turn_ttfb_seconds_count{outcome!="ok"}[$__rate_interval])) by (outcome)
```

**LLM token burn per minute by stage** (cost tracking)
```promql
sum(rate(llm_tokens_total[$__rate_interval])) by (feature, type) * 60
```

> Cross-check a spike against the raw turn in Loki:
> `{service="node-backend"} | json | event="dietician_turn_complete"` — same
> `traceId` (= conversationId), plus `intent` / `gatherTurns` per turn.

---

## 7. Alerts (optional)

Grafana Cloud → **Alerting → Alert rules → New**. Data source: Prometheus.

| Alert | Expression | For |
|---|---|---|
| Dietician p95 wait too high | `histogram_quantile(0.95, sum(rate(dietician_turn_ttfb_seconds_bucket[10m])) by (le)) > 12` | 15m |
| Dietician error ratio high | `sum(rate(dietician_turn_ttfb_seconds_count{outcome!="ok"}[10m])) / sum(rate(dietician_turn_ttfb_seconds_count[10m])) > 0.05` | 10m |
| Metrics scrape down | `up{job="eatbetter-backend"} == 0` | 5m |

Point them at a contact point (email / Slack / Telegram).

---

## 8. What metrics exist

Populated today:

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `dietician_turn_ttfb_seconds` | histogram | `lane`, `outcome` | request → first token the user sees |
| `dietician_turn_duration_seconds` | histogram | `stage` (`prep`\|`gather`\|`stream`\|`total`), `lane`, `outcome` | per-stage turn latency |
| `llm_tokens_total` | counter | `provider`, `feature` (`dietician:classify` …), `type` (`input`\|`output`) | token usage |
| `queue_job_duration_seconds` | histogram | `queue`, `job_name`, `status` | BullMQ job time |

Declared but not yet emitting samples (will show as flat/zero until wired):
`http_request_duration_seconds`, `queue_depth`, `integration_call_duration_seconds`,
`circuit_breaker_state`, `nutrition_low_confidence_total`.

### Optional enhancement — process health

To also get CPU / heap / event-loop-lag / GC for free, add to
[`src/shared/observability/metrics.ts`](src/shared/observability/metrics.ts):

```ts
import { collectDefaultMetrics } from 'prom-client';

// after `export const metricsRegistry = new Registry();`
collectDefaultMetrics({ register: metricsRegistry });
```

Gives `process_cpu_seconds_total`, `nodejs_heap_size_used_bytes`,
`nodejs_eventloop_lag_seconds`, etc. Not done yet — flip it on if you want it.

---

## 9. Plan A fallback (no new infra)

Every dietician turn already writes one structured log line. No Alloy, no
`METRICS_TOKEN`. In Grafana Cloud → Explore → Loki data source:

```logql
{service="node-backend"} | json | event="dietician_turn_complete"
```

Average wait over time (Loki turns a log field into a metric with `unwrap`):
```logql
avg_over_time({service="node-backend"} | json | event="dietician_turn_complete" | unwrap ttfbMs [$__interval])
```

p95:
```logql
quantile_over_time(0.95, {service="node-backend"} | json | event="dietician_turn_complete" | unwrap ttfbMs [$__interval])
```

Fields on the line: `ttfbMs`, `prepMs`, `gatherMs`, `streamMs`, `totalMs`,
`intent`, `lane`, `gatherTurns`, `outcome`.

Downsides vs. Plan B: slower/pricier over long ranges, no cheap long-term
retention, clunkier for alerting.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `curl /metrics` → `404` | `METRICS_TOKEN` not in the container's env. Confirm it's in the app `.env` and `docker compose ... up -d` was rerun. |
| `curl /metrics` → `401` | Token in the curl `Authorization` header ≠ app `METRICS_TOKEN`. |
| Alloy logs: `dial tcp ... i/o timeout` on the scrape | `host.docker.internal` not resolving — the `extra_hosts` line is missing, or the app isn't listening on `172.17.0.1:3100` (`docker compose -f docker-compose.prod.yml ps`). |
| Alloy logs: `remote_write` `401`/`403` | `GC_PROM_USER` (must be the numeric instance ID) or `GC_PROM_TOKEN` wrong, or the token lacks `metrics:write`. |
| Alloy logs: `remote_write` `404` | `GC_PROM_URL` wrong — it must end in `/api/prom/push`. |
| `up{job="eatbetter-backend"}` == `0` in Grafana | Alloy → Cloud works, but Alloy → app scrape fails. Same causes as the two rows above about the scrape. |
| `up` == `1` but no `dietician_*` series | No dietician turns have completed since Alloy started. Send a message, wait a minute. |
| Panels empty after a deploy | Counters reset on restart; `rate()` needs ~2 scrape intervals (1 min) of fresh data. |
| Alloy debug UI | `ssh -N -L 12345:localhost:12345 root@161.97.111.192`, open <http://localhost:12345>. |

---

## 11. Rollback

Stopping the pipeline needs **no app redeploy**:

```bash
cd /app/food-tracker/alloy && docker compose down          # stop shipping
```

To fully disable the endpoint again, remove `METRICS_TOKEN` from the app `.env`
and `docker compose -f docker-compose.prod.yml up -d` — `/metrics` goes back to
`404`. The `dietician turn complete` log line and the in-process histograms are
harmless and stay regardless (negligible cost, no external dependency).

---

## 12. Cost

Grafana Cloud's free tier includes 10k active series and generous ingestion.
This setup adds on the order of ~50–150 series (a handful of histograms ×
bucket count × label combos). Not a concern; check
**Grafana Cloud → Billing/Usage** after a week if you want to be sure.
