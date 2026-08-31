# Deployment (shared VPS + GitHub Actions)

The app ships as one Docker image that serves HTTP **and** runs the BullMQ workers
and polling jobs in-process. Postgres and both Redis instances run as sibling
containers via `docker-compose.prod.yml`. TLS is handled by the **Caddy that
already runs on the server** (its own compose project), which reverse-proxies to
this app over a shared `edge` Docker network. Every push to `main` builds the
image, pushes it to GHCR, and redeploys over SSH (`.github/workflows/deploy.yml`).

```
push main ─► test ─► build image ─► push ghcr.io ─► ssh vps:
                                                      git checkout <sha>
                                                      docker compose pull
                                                      compose run --rm migrate
                                                      docker compose up -d
```

Compose project name is pinned to `food-tracker`, so containers/volumes/networks
(`food-tracker-app-1`, `food-tracker_postgres_data`, …) never collide with the
other stack on the box.

## One-time server setup

1. **Shared `edge` network** — connect it to the existing Caddy so it can reach
   this app by name:

   ```bash
   docker network create edge
   docker network connect edge <existing-caddy-container>
   ```

   Make it permanent in the existing Caddy's compose too:

   ```yaml
   services:
     caddy:
       networks: [default, edge]
   networks:
     edge:
       external: true
   ```

2. **Caddy site block** — add to the existing `Caddyfile` and reload
   (`docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile`):

   ```
   api.yourdomain.tld {
       reverse_proxy food-tracker-app:3000
   }
   ```

3. **DNS** — point an `A` record (e.g. `api.yourdomain.me`) at the server IP.
   The Namecheap `.me` domain from the GitHub Student Pack works.

4. **Deploy user + repo checkout** (as `root`):

   ```bash
   adduser --disabled-password --gecos "" deploy
   usermod -aG docker deploy
   su - deploy
   git clone https://github.com/yusufhoglu/betterEatBetter-server.git ~/app
   cd ~/app
   cp .env.production.example .env    # then edit — see below
   ```

5. **Fill in `.env`** (stays on the server, never committed). Required:
   `DOMAIN`, `POSTGRES_PASSWORD`, `JWT_SECRET`, the `R2_*` keys, `RAG_SERVICE_URL`,
   the selected `LLM_PROVIDER` + its API key, and the `GOOGLE_*` subscription
   values. `DATABASE_URL` / `REDIS_URL` / `REDIS_CACHE_URL` are injected by
   compose — leave them out.

6. **Add an SSH key for CI** — generate a keypair, put the public key in
   `deploy`'s `~/.ssh/authorized_keys`, keep the private key for the secret below.

7. **GitHub → Settings → Secrets and variables → Actions** (or the
   `production` environment):

   | Secret        | Value                                  |
   |---------------|----------------------------------------|
   | `SSH_HOST`    | server IP                              |
   | `SSH_USER`    | `deploy`                               |
   | `SSH_KEY`     | the private key from step 6            |
   | `DEPLOY_PATH` | `/home/deploy/app`                     |

   `GITHUB_TOKEN` is provided automatically and is used to push/pull the image.

8. **First deploy** — either push to `main`, run the *deploy* workflow manually,
   or bring it up by hand once:

   ```bash
   export IMAGE=ghcr.io/yusufhoglu/bettereatbetter-server:latest
   echo $CR_PAT | docker login ghcr.io -u yusufhoglu --password-stdin
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
cd ~/app
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml restart app
curl -fsS https://$DOMAIN/health          # liveness
curl -fsS https://$DOMAIN/health/ready    # DB + Redis reachability
```

### Backups

`postgres_data` is a named Docker volume. A minimal cron backup:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U app food_tracking | gzip > ~/backups/db-$(date +%F).sql.gz
```

## Notes / gotchas

- **Shares the box with another stack** — the `food-tracker` project name and the
  `edge` network keep them isolated. Only Postgres + 2 Redis + Node are added;
  budget ~1–1.5 GB RAM for them.
- **`RAG_SERVICE_URL`** — the Python photo-recognition service is not in this repo.
  Until it is reachable, photo recognition jobs will fail (the rest of the API is fine).
- **Redis is not externally exposed.** `redis-queue` persists (AOF) so queued jobs
  survive a restart; `redis-cache` is memory-only with LRU eviction.
- **Scaling the app to >1 replica is not safe yet** — the polling jobs in
  `src/main.ts` would run on every replica. Fine for a single container.
- **RTDN webhook** — set the Play Console push endpoint and
  `GOOGLE_PLAY_RTDN_AUDIENCE` to `https://<DOMAIN>/subscription/play-rtdn`.
