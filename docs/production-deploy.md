# Production deployment

This guide runs the Express API and private Valhalla on one Linux VM and publishes the API through a Cloudflare Tunnel. The static frontend stays on GitHub Pages. See issue #236 for the acceptance criteria.

Before using it:

- A public API URL needs product-owner approval, as #236 requires.
- VM sizing is a guess until measured on the chosen host. Valhalla memory and disk use are the first things to check.
- Run one Express instance. The shuttle snapshot and rate limiter live in process memory.

## How the pieces fit

```text
browser ──HTTPS──▶ Cloudflare ──tunnel──▶ cloudflared ──localhost:3001──▶ api ──valhalla:8002──▶ valhalla
```

- `cloudflared` opens an outbound connection to Cloudflare, so the VM exposes no inbound web port. Only SSH is open.
- `cloudflared` shares the `api` container's network namespace (`network_mode: service:api`). Express keeps `HOST=127.0.0.1`, as production config requires, and still receives `CF-Connecting-IP` from a loopback peer, which the rate limiter relies on.
- Valhalla has no published port. Only `api` can reach it on the compose network.

Files: [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`scripts/deploy-prod.sh`](../scripts/deploy-prod.sh), [`.github/workflows/deploy-backend-production.yml`](../.github/workflows/deploy-backend-production.yml), and the env templates in [`deploy/`](../deploy).

## Deploy flow

| Environment | Workflow | Hosts | Trigger |
| --- | --- | --- | --- |
| `backend-production` | `deploy-backend-production` | API on the VM | Push to `main` that touches backend inputs (see the `paths` list), or manual. Waits for approval. |
| `frontend-development` | `deploy-frontend-development` | GitHub Pages | Push to `main` that touches frontend inputs, or manual. |
| `frontend-production` | `deploy-frontend-production` | Cloudflare Pages | Manual only. Choose the commit SHA to promote (default `main`). |

The development frontend calls the production API, so keep API changes backwards-compatible: add the new behaviour, deploy the backend, switch the frontend over, and remove the old behaviour in a later change. Deploy the backend before promoting a frontend that needs it.

The backend image copies `frontend/public/data/` and `scripts/generate-shuttle-timing.mjs`, so changes there redeploy the backend. If the Dockerfile starts copying other paths, add them to the `paths` list in the workflow.

## One-time server setup

Assumes Ubuntu 24.04, an SSH user named `ubuntu`, and at least 2 GB of RAM.

1. Install Docker Engine and the Compose plugin by following Docker's [Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Then allow the deploy user to run Docker, and log out and back in:

   ```bash
   sudo usermod -aG docker ubuntu
   ```

2. Add a 2 GB swap file so memory spikes during image builds or tile builds do not kill the VM:

   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

3. Create the deploy directory and clone the repository:

   ```bash
   sudo mkdir -p /opt/navus && sudo chown ubuntu:ubuntu /opt/navus
   git clone https://github.com/LimZiJing/NUSGo.git /opt/navus/repo
   ```

4. Build the Valhalla tiles once. From `/opt/navus/repo`, start the tile-building service and wait until `curl http://127.0.0.1:8002/status` answers:

   ```bash
   docker compose -f docker-compose.valhalla.yml up -d
   ```

   Then copy the result out of the checkout, because deploys check out other commits, and stop the builder:

   ```bash
   cp -a docker/valhalla/custom_files /opt/navus/valhalla
   docker compose -f docker-compose.valhalla.yml down
   ```

   `/opt/navus/valhalla` must contain `valhalla.json`, `valhalla_tiles`, and `valhalla_tiles.tar`.

5. Create the tunnel in Cloudflare: Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared. Copy the token from the install command. Add a public hostname, for example `api.<your-domain>`, with service type HTTP and URL `localhost:3001`. Delete any plain DNS `A` record for the same name first, because the tunnel creates its own record.

6. Create the two env files on the server from the templates, then restrict them:

   ```bash
   cp /opt/navus/repo/deploy/compose.env.example /opt/navus/compose.env
   cp /opt/navus/repo/deploy/backend.env.example /opt/navus/backend.env
   chmod 600 /opt/navus/compose.env /opt/navus/backend.env
   nano /opt/navus/compose.env   # set TUNNEL_TOKEN
   nano /opt/navus/backend.env   # set API_CORS_ORIGINS and any provider credentials
   ```

   Edit these files only on the server. Never commit them or paste their contents into chat, issues, or logs.

7. Create a separate deploy key, install its public half on the server, and record the server's host key:

   ```bash
   ssh-keygen -t ed25519 -C "navus-deploy" -f ~/.ssh/navus_deploy
   ssh-keyscan -t ed25519 <server-ip>
   ```

   Append the contents of `navus_deploy.pub` to `~/.ssh/authorized_keys` on the server. The `ssh-keyscan` output is the value for `DEPLOY_KNOWN_HOSTS`.

8. In GitHub, create an environment named `backend-production` (Settings → Environments). Add required reviewers: the development frontend calls this backend, so each deploy should wait for approval. Add these environment secrets:

   | Secret | Value |
   | --- | --- |
   | `DEPLOY_HOST` | server IP address |
   | `DEPLOY_USER` | `ubuntu` |
   | `DEPLOY_KEY` | contents of the private `navus_deploy` file |
   | `DEPLOY_KNOWN_HOSTS` | the `ssh-keyscan` output |

   Set the repository variable `NUSGO_API_ORIGIN` to `https://api.<your-domain>` so the Pages build points at the API.

## Deploying

Each push to `main` runs the tests, then deploys that commit. The workflow can also be run by hand from the Actions tab.

The commit SHA becomes `NUSGO_DATA_VERSION`, matching the `VITE_DATA_VERSION` the Pages workflow embeds in the frontend from the same commit. For a short time after a push the frontend and API may be on different versions until both workflows finish.

Check a deploy from your own machine:

```bash
curl https://api.<your-domain>/api/health
curl https://api.<your-domain>/api/ready
```

`/api/ready` returns 503 until canonical data is loaded and the first complete bus-arrival snapshot has been published.

## Rolling back

Revert the bad commit on `main`; the same pipeline redeploys the previous state. For an emergency, run the script on the server with an earlier commit SHA:

```bash
bash /opt/navus/repo/scripts/deploy-prod.sh <full-commit-sha>
```

The frontend embeds its own data version, so also roll the Pages build back to that commit, or the two will report mismatched versions.

## Failure diagnosis

- API unreachable but the VM is up: `docker compose -p navus --env-file /opt/navus/compose.env -f /opt/navus/repo/docker-compose.prod.yml ps`. If `cloudflared` is not running, check its logs. It must be recreated whenever `api` is.
- `api` exits at start: its logs name the missing or invalid setting. Production config requires `API_CORS_ORIGINS` with HTTPS entries including `https://limzijing.github.io`.
- Every user shares one rate limit: requests are reaching Express without `CF-Connecting-IP`. They must arrive through the tunnel, not a direct route.
- Disk filling: container logs are capped at 3 files of 10 MB each, and the deploy script prunes dangling images. Valhalla tiles are the largest item.
