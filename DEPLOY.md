# Deployment (shared VPS + GitHub Actions)

The app ships as one Docker image that serves HTTP **and** runs the BullMQ workers
and polling jobs in-process. Postgres and both Redis instances run as sibling
containers via `docker-compose.prod.yml`. The stack publishes the app on
`127.0.0.1:3100` only; the **host Caddy** (the `matcher-prod-caddy` container,
a separate compose project) terminates TLS and reverse-proxies to it. Every push
to `main` builds the image, pushes it to GHCR, and redeploys over SSH
(`.github/workflows/deploy.yml`).

```
push main ─► check ─► build image ─► push ghcr.io ─► scp docker-compose.prod.yml ─► ssh vps:
                                                                                     docker compose pull
                                                                                     compose run --rm migrate
                                                                                     docker compose up -d
```

Compose project name is pinned to `food-tracker`, so containers/volumes
(`food-tracker-app-1`, `food-tracker_postgres_data`, …) never collide with the
other stacks on the box. Everything runs as `root`; the repo lives at
`/app/food-tracker/betterEatBetter-server` (= `DEPLOY_PATH`).

## One-time server setup

1. **DNS** — add an `A` record `foodtracker.hembul.com` → `161.97.111.192`.

2. **Caddy site block** — append to `/app/backend/deploy/Caddyfile`:

   ```
   foodtracker.hembul.com {
       encode gzip
       reverse_proxy host.docker.internal:3100
   }
   ```

   then reload: `docker exec matcher-prod-caddy caddy reload --config /etc/caddy/Caddyfile`

3. **`.env`** — in the repo dir, `cp .env.production.example .env` and fill in:
   `DOMAIN` (`foodtracker.hembul.com`), `POSTGRES_PASSWORD`, `JWT_SECRET`, the
   `R2_*` keys, `RAG_SERVICE_URL`, the selected `LLM_PROVIDER` + its API key, and
   the `GOOGLE_*` subscription values. `DATABASE_URL` / `REDIS_URL` /
   `REDIS_CACHE_URL` are injected by compose — leave them out.

4. **GitHub → Settings → Secrets and variables → Actions**:

   | Secret        | Value                                          |
   |---------------|------------------------------------------------|
   | `SSH_HOST`    | `161.97.111.192`                               |
   | `SSH_USER`    | `root`                                          |
   | `SSH_KEY`     | CI private key (public half in `authorized_keys`) |
   | `DEPLOY_PATH` | `/app/food-tracker/betterEatBetter-server`      |

   `GITHUB_TOKEN` is provided automatically and is used to push/pull the image.

5. **First deploy** — push to `main`, run the *deploy* workflow manually, or once
   by hand from the repo dir:

   ```bash
   export IMAGE=ghcr.io/yusufhoglu/bettereatbetter-server:latest
   echo "$CR_PAT" | docker login ghcr.io -u yusufhoglu --password-stdin
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml run --rm migrate
   docker compose -f docker-compose.prod.yml up -d
   ```

## After that

Just `git push`. CI runs typecheck + unit tests, builds, and redeploys.
Migrations (`prisma migrate deploy`) run automatically before the new container
starts.

## Operating it

```bash
cd /app/food-tracker/betterEatBetter-server
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml restart app
curl -fsS https://$DOMAIN/health          # liveness
curl -fsS https://$DOMAIN/health/ready    # DB + Redis reachability
```

### Inspecting the database from a laptop

Postgres publishes on the server's loopback only (`127.0.0.1:5432`). Tunnel in:

```bash
ssh -N -L 5433:localhost:5432 root@161.97.111.192      # keep this open
# then, elsewhere:
DATABASE_URL='postgresql://app:<POSTGRES_PASSWORD>@127.0.0.1:5433/food_tracking' npx prisma studio
```

(PowerShell: `$env:DATABASE_URL='...'; npx prisma studio` — `.env` won't override an env var already set.)

### Backups

`postgres_data` is a named Docker volume. A minimal cron backup:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U app food_tracking | gzip > ~/backups/db-$(date +%F).sql.gz
```

## Notes / gotchas

- **Shares the box with other stacks** — the `food-tracker` compose project name
  keeps containers/volumes isolated. Only Postgres + 2 Redis + Node are added;
  budget ~1–1.5 GB RAM for them.
- **Caddy reaches the app at `host.docker.internal:3100`** — the caddy container
  already resolves that to the docker0 gateway, matching how the existing
  `*.dev.yusufhocaoglu.site` blocks proxy to host ports.
- **`RAG_SERVICE_URL`** — the Python photo-recognition service is not in this repo.
  Until it is reachable, photo recognition jobs will fail (the rest of the API is fine).
- **Redis is not externally exposed.** `redis-queue` persists (AOF) so queued jobs
  survive a restart; `redis-cache` is memory-only with LRU eviction.
- **Scaling the app to >1 replica is not safe yet** — the polling jobs in
  `src/main.ts` would run on every replica. Fine for a single container.
- **RTDN webhook** — set the Play Console push endpoint and
  `GOOGLE_PLAY_RTDN_AUDIENCE` to `https://<DOMAIN>/subscription/play-rtdn`.
