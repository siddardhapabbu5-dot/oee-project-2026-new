# Deploy Nakshatra OEE on DigitalOcean (Bangalore)

This guide deploys **website + API + PostgreSQL** as one always-on cloud app.

**Result:** Your team opens one URL (e.g. `https://nakshatra-oee-xxxxx.ondigitalocean.app`) — no `localhost`, no Docker on user PCs, no daily `npm run dev`.

---

## What is included in this repo

| File | Purpose |
|------|---------|
| `Dockerfile` | Builds React frontend + Express API |
| `docker-entrypoint.sh` | Runs DB migrations, starts server |
| `.do/app.yaml` | DigitalOcean App Platform config (Bangalore `blr`) |

---

## Prerequisites

1. [DigitalOcean account](https://cloud.digitalocean.com/registrations/new)
2. GitHub repo pushed: `siddardhapabbu5-dot/oee-project-2026-new`
3. Credit card on DigitalOcean (~**$24/month** for small app + managed Postgres)

---

## Step 1 — Push latest code to GitHub

From your PC:

```powershell
cd "C:\Users\harsh\oee project 2026 new"
git add .
git commit -m "Add DigitalOcean production deployment."
git push origin main
```

---

## Step 2 — Create the app on DigitalOcean

1. Log in to [DigitalOcean](https://cloud.digitalocean.com/)
2. Go to **Apps** → **Create App**
3. Choose **GitHub** → authorize → select repo **`oee-project-2026-new`**
4. Branch: **`main`**
5. DigitalOcean may detect the Dockerfile automatically  
   - If asked, choose **Dockerfile** at repo root  
   - Or upload spec: use **`.do/app.yaml`** (Edit your app spec → paste contents)
6. **Region:** **Bangalore (BLR1)** — best for India
7. **Resources** (from `app.yaml`):
   - **Web service** — `basic-xxs` or `basic-xs` (~$5–12/mo)
   - **PostgreSQL 16** — dev or production tier (~$15/mo)
8. **Environment variables** — set before deploy:

| Key | Value |
|-----|--------|
| `JWT_SECRET` | Long random string (min 32 chars). Generate on your PC: `[Convert]::ToBase64String((1..48 \| ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])` — **save it somewhere safe; never commit to GitHub** |
| `NODE_ENV` | `production` (usually set by spec) |
| `DATABASE_URL` | Auto-filled when you attach the Postgres database |
| `CORS_ORIGIN` | Start with `${_self.PUBLIC_URL}`; after custom domain, set to `https://oee.nakshatrabeverages.com` |

9. Click **Create Resources** / **Deploy**

First deploy takes **5–15 minutes** (build + migrations).

### Step 2A — JWT secret (required)

1. In DigitalOcean → your app → **Settings** → **App-Level Environment Variables**
2. Add **`JWT_SECRET`** → type **SECRET**
3. Paste a long random value (48+ characters)
4. **Save** and **Redeploy** if the app already deployed without it

Without `JWT_SECRET`, login will not work in production.

### Step 2B — Custom domain `oee.nakshatrabeverages.com`

1. DigitalOcean app → **Settings** → **Domains** → **Add Domain**
2. Enter: `oee.nakshatrabeverages.com`
3. DigitalOcean shows a **CNAME** record, e.g.  
   `oee` → `nakshatra-oee-xxxxx.ondigitalocean.app`
4. At your domain provider (where `nakshatrabeverages.com` is registered):
   - **Type:** CNAME  
   - **Host/Name:** `oee`  
   - **Value/Target:** the `ondigitalocean.app` hostname from step 3  
   - **TTL:** 300 or Auto
5. Wait 5–60 minutes for DNS to propagate
6. DigitalOcean issues **HTTPS** automatically
7. Update env var **`CORS_ORIGIN`** to `https://oee.nakshatrabeverages.com` → **Redeploy**

Your team then uses: **https://oee.nakshatrabeverages.com**

### Step 2C — First admin user

Production database starts empty. After first successful deploy:

**Option 1 — Seed demo admin (quickest)**

1. DigitalOcean → app → **Console** tab (or **Run command**)
2. Run:
   ```bash
   npx prisma db seed
   ```
3. Login at your cloud URL:
   - **Email:** `admin@pms.local`
   - **Password:** `Password@123`
4. **Immediately:** Profile → change password (and add real users under **Users**)

**Option 2 — Production-only (recommended after testing)**

1. Use seed once to create admin (above)
2. **Users** page → create supervisors/managers with real emails
3. Change admin password; disable or remove demo accounts if not needed

---

## Step 3 — Verify

1. Open the app URL from DigitalOcean (e.g. `https://nakshatra-oee-xxxxx.ondigitalocean.app`)
2. Health check: `https://YOUR-URL/health` → should show `"status":"ok","database":"up"`
3. Login page should load
4. API docs: `https://YOUR-URL/api/docs`

---

## Step 4 — First-time data (users & master data)

The production database starts **empty**. Choose one:

### Option A — Run seed once (demo / test data)

In DigitalOcean → your app → **Console** (or one-off job):

```bash
npx prisma db seed
```

Uses demo users from seed (change passwords before real use).

### Option B — Production setup (recommended)

1. Create admin via seed once, then change password in **Profile**
2. Enter master data in the app: Plants, Lines, Shifts, Products, Users

---

## Step 5 — Custom domain (optional)

1. DigitalOcean app → **Settings** → **Domains**
2. Add e.g. `oee.nakshatrabeverages.com`
3. Add DNS records at your domain provider (CNAME as shown by DO)
4. HTTPS is automatic
5. Update `CORS_ORIGIN` to `https://oee.nakshatrabeverages.com` if needed

---

## Daily use after go-live

| Who | What |
|-----|------|
| Supervisors | Open cloud URL → Login → **Production Entries** |
| You (admin) | DigitalOcean dashboard for monitoring; enable **DB backups** |

No terminals on shop-floor PCs.

---

## Updates (new code)

Push to GitHub `main` — DigitalOcean **auto-redeploys** if enabled.

```powershell
git add .
git commit -m "Your change"
git push origin main
```

---

## Cost estimate (Bangalore)

| Item | Approx/month |
|------|----------------|
| App (basic-xxs) | ~$5 |
| Managed PostgreSQL | ~$15 |
| **Total** | **~$20–25 USD (~₹1,700–2,100)** |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Deploy failed at build | Check **Runtime Logs** in DigitalOcean |
| `database: down` on `/health` | Wait 2 min; check `DATABASE_URL` is linked to Postgres |
| Login fails | Confirm `JWT_SECRET` is set; redeploy |
| Blank page | Check build logs; ensure `frontend` build succeeded |

---

## Local vs cloud

| | Local (`npm run dev`) | Cloud (DigitalOcean) |
|---|----------------------|----------------------|
| URL | `localhost:5176` | `https://your-app.ondigitalocean.app` |
| API must be started manually | Yes | No — always on |
| Docker on user PC | Yes | No |
| For daily production use | Dev/testing only | **Yes** |

---

## Support

- DigitalOcean docs: https://docs.digitalocean.com/products/app-platform/
- Repo issues: GitHub `oee-project-2026-new`
