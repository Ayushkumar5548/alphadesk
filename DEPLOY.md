# Deploying AlphaDesk to run 24/7 (no PC required)

AlphaDesk is **one zero-dependency Node process** that serves both the JSON API
and the built React client. Anything that can run a container can host it. The
repo already contains everything a host needs:

| File | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage image: builds the client, then runs the zero-dep server |
| `.dockerignore` | Keeps `node_modules`, caches and `dist/` out of the image |
| `render.yaml` | Render "Blueprint" config (free tier) |
| `fly.toml` | Fly.io config, pinned always-on |
| `package.json` | `npm start` / `npm run build` for platforms that build from source |

Server facts that matter for hosting:
- Listens on `PORT` (default **8787**) and `HOST` (default `0.0.0.0`).
- Health probe: `GET /api/health` → `{"ok":true,...}` (never touches disk).
- Serves the SPA + API from the same origin. No database, no API keys.
- Live data comes from Yahoo Finance (+ mfapi.in for funds). If a source is
  unreachable it serves the labelled **simulated** baseline instead of blanks.

---

## Option A — Render (free, easiest)

Cost: **$0**. Needs: a free **GitHub** account + a free **Render** account.
Behaviour: free instances **sleep after 15 min idle**; the next visit takes
~30–60 s to wake, then it is fast. It is always *available*, just cold at first.

**1) Publish this folder to GitHub** (repo root must be this `alpha/` folder):

```powershell
# one-time, if you don't already have the tools
winget install --id Git.Git -e
winget install --id GitHub.cli -e

cd alpha
git init -b main
git add -A
git commit -m "AlphaDesk"
gh auth login                      # choose GitHub.com -> HTTPS -> login in browser
gh repo create alphadesk --private --source . --push
```

(`.gitignore` already excludes `node_modules/`, `dist/` and the regenerable
`server/data/` caches, so only ~1 MB of source is pushed.)

**2) Deploy on Render**

2. Sign in at <https://dashboard.render.com> with GitHub.
3. **New +** → **Blueprint** → pick the repo. Render reads `render.yaml` and
   builds the `Dockerfile` automatically.
4. Wait for the first build (~3–5 min). Your URL is
   `https://alphadesk.onrender.com` (or whatever name you picked).

Manual alternative without the blueprint: **New +** → **Web Service** → repo →
Runtime **Docker** → Health Check Path `/api/health` → Plan **Free**.

To keep it warm you can point any uptime monitor (e.g. UptimeRobot, free) at
`https://<your-app>.onrender.com/api/health` every 5 minutes. That also keeps
you well inside the free hours allowance.

---

## Option B — Fly.io (truly always-on, ~US$3/month)

Cost: ~US$3/mo for the 1 GB machine in `fly.toml`. Needs: a Fly account with a
card on file. Deploys straight from this PC — **no GitHub needed**.

```powershell
# one-time: install the CLI
iwr https://fly.io/install.ps1 -useb | iex

# one-time: create/login to your account (opens a browser)
fly auth signup      # or: fly auth login

cd alpha
fly launch --no-deploy --copy-config     # accept, rename the app if prompted
fly deploy
```

`fly.toml` already sets `auto_stop_machines = "off"` and
`min_machines_running = 1`, so the machine never sleeps. Your URL is
`https://<app>.fly.dev`.

Optional persistent state (keeps watchlists across deploys):

```powershell
fly volumes create alphadesk_data --size 1 --region sin
# then uncomment the [mounts] block in fly.toml:
#   [mounts]
#     source = "alphadesk_data"
#     destination = "/app/server/data"
fly deploy
```

---

## Option C — Hugging Face Space (free, 16 GB RAM, no card)

Cost: **$0**. Needs: a free Hugging Face account. Behaviour: sleeps only after
**48 h** with no visitors (~30 s to wake) — much stickier than Render's 15 min.

1. Create a Space at <https://huggingface.co/new-space>:
   - **SDK:** Docker → **Blank**
   - **Hardware:** CPU basic (free)
2. Put the Space's metadata in a `README.md` **at the Space root** (the Space
   repo needs this; the repo's own `README.md` stays your project docs):

   ```markdown
   ---
   title: AlphaDesk
   sdk: docker
   app_port: 8787
   pinned: false
   ---
   ```

3. Push this `alpha/` folder to the Space's git repo (or upload the files via
   the web UI). The Space builds `Dockerfile` and serves at
   `https://<username>-<space>.hf.space`.

The container runs as UID 1000 (`USER node`), which is what Spaces expect.

---

## Notes that apply to every host

- **Persistent state.** Watchlists, alerts, saved screeners and notes live in
  `server/data/state.json`. Free tiers use ephemeral disks, so that file resets
  when the app redeploys or restarts. To keep it, mount a persistent disk or
  volume at `/app/server/data` (Render Disk, Fly Volume, or your VM's disk).
  Market caches in the same folder are rebuildable and can be discarded.
- **Custom domain.** Render, Fly and HF all let you attach your own domain with
  automatic HTTPS.
- **Cold start.** Real backtests switch on once benchmark + price history have
  warmed (a few seconds after boot). Requests made in the first moments get the
  labelled simulated baseline and become real automatically.
- **Health endpoint.** `GET /api/health` → `{"ok":true,...}` for uptime checks.
- **Local run (unchanged).** `npm start` in this folder, then open
  <http://localhost:8787>.
