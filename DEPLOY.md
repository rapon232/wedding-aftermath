# Deploying **#LoveWins. The Aftermath**

A complete, do-it-in-order guide to putting the gallery online at
`aftermath.mitio.tech`, testing it privately with Jenny, and only *then*
inviting all your guests.

Same shape as your `wedding.mitio.tech` setup: **one Docker container on the
Synology NAS, reached through a Cloudflare tunnel.** No ports opened to the
internet, all photos stay on the NAS.

> **Golden rule:** do every step below with just you and Jenny first. The very
> last section — *Invite everyone* — is the last thing you do, after it all works.

---

## Table of contents

1. [What you'll end up with](#1-what-youll-end-up-with)
2. [Before you start (checklist)](#2-before-you-start)
3. [Get the code onto the NAS](#3-get-the-code-onto-the-nas)
4. [Configure `.env`](#4-configure-env)
5. [Start the container](#5-start-the-container)
6. [Point `aftermath.mitio.tech` at it (Cloudflare)](#6-point-aftermathmitiotech-at-it)
7. [First test — just you and Jenny](#7-first-test--just-you-and-jenny)
8. [Turn on the safety net (backups + monitoring)](#8-turn-on-the-safety-net)
9. [Troubleshooting](#9-troubleshooting)
10. [🎉 LAST step: invite everyone](#10--last-step-invite-everyone)

---

## 1. What you'll end up with

- `https://aftermath.mitio.tech` — the gallery, behind a login.
- Each guest has a personal code (e.g. `ROSE-7K3M`). You generate them.
- Everything (originals, thumbnails, database) lives in **one folder** on the
  NAS. Back up that folder and nothing is ever lost.

---

## 2. Before you start

You need:

- [ ] **Synology NAS** with **Container Manager** (DSM 7.2+) or Docker installed — the same one running `wedding.mitio.tech`.
- [ ] **cloudflared tunnel** already working for `wedding.mitio.tech` (you have this).
- [ ] **SSH access** to the NAS (Control Panel → Terminal & SNMP → Enable SSH), *or* you'll use the Container Manager GUI.
- [ ] The domain **`mitio.tech`** on Cloudflare (you have this).
- [ ] ~30 minutes.

Decide two things up front:

| Setting | Recommended value | Why |
|---|---|---|
| **Data folder on the NAS** | `/volume1/docker/wedding_aftermath_data` | Where all media + DB live. Pick a share your NAS backup already covers. |
| **Local port** | `3000` (or any free port) | cloudflared will connect to this on the NAS. |

---

## 3. Get the code onto the NAS

Pick one:

**Option A — copy the folder** (simplest): copy this whole `wedding-photos`
project to the NAS, e.g. to `/volume1/docker/wedding_aftermath`. Use File Station,
`scp`, or a synced drive. (The `data/`, `node_modules/`, and `dist/` folders are
not needed — they're rebuilt or created on the NAS.)

**Option B — git** (if you keep it in a repo): `git clone` it to
`/volume1/docker/wedding_aftermath` on the NAS.

From here on, the project lives at **`/volume1/docker/wedding_aftermath`** — adjust paths
if you chose another location.

---

## 4. Configure `.env`

In the project folder on the NAS, create your `.env` from the template:

```bash
cd /volume1/docker/wedding_aftermath
cp .env.example .env
```

Edit `.env` (nano, vi, or File Station's text editor) and set:

```ini
# A long random secret — generate it and paste the output:
#   openssl rand -hex 32
SESSION_SECRET=paste-the-64-character-hex-here

# Your name — becomes the first admin guest.
ADMIN_NAME=Mitio

# The wedding's timezone (Sicily). Photo timestamps are shown in this zone.
EVENT_TZ=Europe/Rome

# Local port cloudflared will connect to on the NAS.
HOST_PORT=3000

# Where all media + the database live on the NAS.
DATA_PATH=/volume1/docker/wedding_aftermath_data
```

Generate the secret on the NAS with:

```bash
openssl rand -hex 32
```

> You do **not** need to set file permissions on the data folder — the container
> starts as root, fixes ownership of `DATA_PATH` automatically, then drops to an
> unprivileged user. This avoids the classic Synology "permission denied" crash.

---

## 5. Start the container

### If you have SSH (recommended)

```bash
cd /volume1/docker/wedding_aftermath
sudo docker compose up -d --build
```

The first build takes a few minutes (it installs ffmpeg and compiles image
tooling). When it's done:

```bash
# Confirm it's healthy:
sudo docker compose exec aftermath wget -qO- http://localhost:3000/api/health
# → {"ok":true,"media":0,"uptimeSec":...,"diskFreeGb":...}

# Grab your one-time admin code (printed once on first boot):
sudo docker compose logs | grep "access code"
# → ★ Admin guest "Mitio" created — access code: ABCD-2345
```

**Write that admin code down.** If you ever lose it, don't panic and don't delete
anything — just run:

```bash
sudo docker compose exec aftermath node scripts/reset-admin.mjs
```

### If you use Container Manager (GUI, no SSH)

1. Container Manager → **Project** → **Create**.
2. Path: `/volume1/docker/wedding_aftermath`, source: the existing `docker-compose.yml`.
3. Make sure your `.env` is in that folder first (step 4).
4. Build & run. Then open the project's **Logs** and look for the `access code` line.

---

## 6. Point `aftermath.mitio.tech` at it

You already run a Cloudflare tunnel for `wedding.mitio.tech`. You're just adding
one more hostname that points to the new container's port.

### If you manage the tunnel in the Cloudflare dashboard (Zero Trust)

1. Cloudflare **Zero Trust** → **Networks → Tunnels** → your tunnel → **Configure**.
2. **Public Hostname** → **Add a public hostname**:
   - **Subdomain:** `aftermath`
   - **Domain:** `mitio.tech`
   - **Service type:** `HTTP`
   - **URL:** `localhost:3000` (or `<nas-ip>:3000` — match your `HOST_PORT`)
3. Save. DNS is created for you automatically.

### If you manage the tunnel with a `config.yml` file on the NAS

Add an ingress rule next to your existing `wedding` one:

```yaml
ingress:
  - hostname: wedding.mitio.tech
    service: http://localhost:8080      # your existing app
  - hostname: aftermath.mitio.tech
    service: http://localhost:3000      # this app (HOST_PORT)
  - service: http_status:404            # keep this catch-all LAST
```

Then restart cloudflared (e.g. `sudo systemctl restart cloudflared`, or restart
the cloudflared container/DSM task). If the DNS route isn't created yet:

```bash
cloudflared tunnel route dns <your-tunnel-name> aftermath.mitio.tech
```

### Verify

Open **https://aftermath.mitio.tech** in your browser. You should see the login
card with the ♥ and the faint playing-card background. Log in with your admin
code. 🎉

---

## 7. First test — just you and Jenny

Do this before anyone else touches it.

**On your phone (as admin):**
1. Log in with your admin code at `aftermath.mitio.tech`.
2. Tap **Guests** → type `Jenny` → **Create codes** → copy her code
   (e.g. `JADE-7K2M`). Send it to her.
3. Upload a few real photos from the wedding, including:
   - an **iPhone HEIC** photo (confirm it shows a thumbnail — the HEIC→WebP
     conversion working is the one thing worth eyeballing),
   - a **video** (watch it play; if a clip won't play you'll see a "Download to
     view" fallback, which is expected for some phone codecs),
   - a **big video (>100 MB)** over cellular, not Wi-Fi — this exercises the
     chunked-upload path that gets around Cloudflare's limit.

**On Jenny's phone:**
4. She opens `aftermath.mitio.tech`, enters her code, uploads her own photos.
5. Check that her uploads show **"by Jenny"** and appear under the right date.

**Together, run through every feature:**
- [ ] Tap a photo → it opens full-screen; swipe / arrow-key between photos.
- [ ] Tap the **♥** on a few — try the **"Most loved ♥"** sort.
- [ ] Tap **💬** inside a photo, leave a comment, see it appear; delete it.
- [ ] **Leave a note** (next to Upload) → write a message → it shows in the guestbook.
- [ ] **Select** a few → **Download** → you get a zip. Also try **Download all**.
- [ ] As admin, open a photo and **✦ Pin** it → it jumps to a featured tile on top.
- [ ] Add it to your phone home screen ("Add to Home Screen") — it opens like an app.
- [ ] Delete one of your own uploads; confirm Jenny *can't* delete yours.

If anything's off, tell me — it's much easier to fix now than after 65 people are in.

---

## 8. Turn on the safety net

These protect the one thing that can't be recreated: everyone's original photos.

**Nightly backup check** (alerts if media count/size ever drops unexpectedly).
Add a scheduled task in **DSM → Control Panel → Task Scheduler**, or a cron line:

```cron
0 3 * * *  cd /volume1/docker/wedding_aftermath && sudo docker compose exec -T aftermath node scripts/check-backup.mjs >> /volume1/docker/wedding_aftermath/backup.log 2>&1
```

**Make sure `DATA_PATH` is included in your Synology backup** (Hyper Backup /
Snapshot Replication). That single folder is the whole gallery.

**Uptime alert (optional but nice):** point a free monitor
([UptimeRobot](https://uptimerobot.com)) at
`https://aftermath.mitio.tech/api/health`. If the container ever crashes, you get
an email. (The container also auto-restarts itself.)

**If you ever suspect a problem**, this reports (and repairs with `--fix`) any
mismatch between the database and files on disk:

```bash
sudo docker compose exec aftermath node scripts/integrity-sweep.mjs
```

**After the event**, grab a full offsite copy of every original:

```bash
sudo docker compose exec aftermath node scripts/export-all.mjs /data
# creates /data/aftermath-originals-YYYY-MM-DD.zip — copy it somewhere safe
```

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| **Login page loads but code is rejected** | You're using the right code? Re-grab it: `docker compose logs \| grep "access code"`, or `docker compose exec aftermath node scripts/reset-admin.mjs`. |
| **`aftermath.mitio.tech` won't load** | Tunnel hostname points to the wrong port, or cloudflared wasn't restarted. Check `HOST_PORT` in `.env` matches the tunnel's service URL. |
| **Container keeps restarting** | `docker compose logs` — most likely `SESSION_SECRET` isn't set in `.env`. |
| **HEIC photo shows a broken thumbnail** | Tell me — the pure-JS fallback should handle it; I'll adjust. |
| **Big video upload fails** | Use Wi-Fi, or confirm it's under 2 GB. The app chunks anything over ~90 MB automatically. |
| **"The gallery is full"** | The NAS volume is low on space (guard trips under 1 GB free). Free space or expand the volume. |
| **Redeploy after a code change** | `cd /volume1/docker/wedding_aftermath && git pull` (or re-copy files) → `sudo docker compose up -d --build`. Your data in `DATA_PATH` is untouched. |

---

## 10. 🎉 LAST step: invite everyone

**Only after everything above works and you and Jenny are happy.**

You have ~65 guests. Two ways to onboard them:

**Easiest — you already planned this:** download the guest CSV (names + emails)
from your **Joy.com** wedding page and hand it to me. I'll:
- parse the names and emails,
- bulk-generate a personal code for each guest,
- draft the invite emails (personal code + the `aftermath.mitio.tech` link),
- and give you a `name → code → email` list as a backup.

**Or by hand:** in the **Guests** panel, paste all the names (one per line),
click **Create codes**, then **"Copy all as Name: CODE"** and send each person
their line.

Then send the invite. People upload from wherever they are, and the memories roll
in. ♥

> If a code ever leaks or someone should lose access, open **Guests** and
> **Revoke** it — their sessions die immediately and the code stops working.
