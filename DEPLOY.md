# flop — Cloudflare Deployment Guide

Full deployment of flop on Cloudflare: Worker (Hono + Durable Objects + D1) and Pages (React SPA), with AWS S3 for file storage.

---

## Architecture

```
Browser
  ↕ HTTPS
Cloudflare Pages  (React SPA — static, no server)
  ↕ /api/*
Cloudflare Worker (Hono REST + WebSocket signaling)
  ↕ Bindings
  ├── D1           (SQLite — rooms, files, aliases metadata)
  ├── KV           (fast alias lookups)
  └── Durable Objects  (per-transfer WebSocket signaling rooms)
  ↕ Presigned URLs
AWS S3             (encrypted file storage, 24h auto-expiry)
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Bun | ≥ 1.2 | `curl -fsSL https://bun.sh/install \| bash` |
| Wrangler | bundled | `bunx wrangler --version` to verify |
| AWS CLI | any | optional — all AWS steps can be done in the Console |

You need:
- A **Cloudflare account** with Workers, D1, KV, Durable Objects, and Pages enabled
- An **AWS account** with an S3 bucket and an IAM user

---

## Step 1 — Clone and install

```bash
git clone <your-repo-url> flop
cd flop
bun install
```

---

## Step 2 — Cloudflare infrastructure (one-time)

### 2a. Log in

```bash
bunx wrangler login
```

### 2b. Create the D1 database

```bash
bunx wrangler d1 create flop-db
```

Copy the `database_id` from the output. Open `apps/worker/wrangler.jsonc` and replace the existing `database_id` value:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "flop-db",
    "database_id": "PASTE_DATABASE_ID_HERE",
    "migrations_dir": "src/db/migrations"
  }
]
```

### 2c. Create the KV namespace

```bash
bunx wrangler kv namespace create ALIASES
bunx wrangler kv namespace create ALIASES --preview
```

Each command prints an `id`. Replace the two placeholders in `apps/worker/wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "KV_ALIASES",
    "id": "PASTE_PRODUCTION_KV_ID_HERE",
    "preview_id": "PASTE_PREVIEW_KV_ID_HERE"
  }
]
```

---

## Step 3 — AWS S3 setup (one-time)

### 3a. Create the bucket

Replace `eu-north-1` with your preferred region if needed:

```bash
aws s3api create-bucket \
  --bucket flop-files \
  --region eu-north-1 \
  --create-bucket-configuration LocationConstraint=eu-north-1
```

> For `us-east-1`, omit `--create-bucket-configuration`.

### 3b. Block all public access

Files are served only via presigned URLs — keep the bucket fully private:

```bash
aws s3api put-public-access-block \
  --bucket flop-files \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 3c. Set the CORS policy

The browser uploads directly to S3 via presigned PUT URLs, so S3 needs a CORS rule. Replace the origin with your actual frontend domain:

```bash
aws s3api put-bucket-cors \
  --bucket flop-files \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["https://your-project.pages.dev"],
      "AllowedMethods": ["PUT", "GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }]
  }'
```

> If you have a custom domain on Pages (e.g. `https://flop.example.com`), add both origins to the array.

### 3d. Set up lifecycle auto-deletion (24 h)

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket flop-files \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-after-24h",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Expiration": { "Days": 1 }
    }]
  }'
```

### 3e. Create an IAM user with least-privilege S3 access

1. In the AWS Console, go to **IAM → Policies → Create policy**.
2. Paste this JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::flop-files/*"
    }
  ]
}
```

3. Name it `flop-s3-policy` and save it.
4. Go to **IAM → Users → Create user**, name it `flop-worker`, attach `flop-s3-policy`.
5. Under the user, go to **Security credentials → Create access key** (type: *Application running outside AWS*).
6. Save the **Access key ID** and **Secret access key** — they are shown only once.

---

## Step 4 — Environment variables and secrets

### 4a. Non-secret vars — edit `apps/worker/wrangler.jsonc`

All plain config lives in the `"vars"` block. Update for your deployment:

```jsonc
"vars": {
  "AWS_REGION": "eu-north-1",          // must match the region of your S3 bucket
  "S3_BUCKET_NAME": "flop-files",      // must match the bucket name from Step 3a
  "FRONTEND_ORIGIN": [                 // all origins that are allowed to call the Worker
    "https://your-project.pages.dev",  // your Cloudflare Pages URL
    "https://flop.example.com"         // your custom domain (add or remove as needed)
  ],
  "MAX_FILE_SIZE": "104857600"         // 100 MB in bytes — increase if needed
}
```

> `FRONTEND_ORIGIN` is used by the Worker's CORS middleware. It must include every domain your frontend is served from, including both the `*.pages.dev` subdomain and any custom domain.

### 4b. Secrets — set via Wrangler (never stored in files)

```bash
cd apps/worker
bunx wrangler secret put AWS_ACCESS_KEY_ID
# paste the Access key ID from Step 3e, then press Enter

bunx wrangler secret put AWS_SECRET_ACCESS_KEY
# paste the Secret access key from Step 3e, then press Enter
```

Secrets are encrypted and stored by Cloudflare. They are injected into the Worker at runtime as `c.env.AWS_ACCESS_KEY_ID` / `c.env.AWS_SECRET_ACCESS_KEY`.

### 4c. Drizzle migration credentials — local shell only

These are needed only when running remote D1 migrations. Set them in your shell or in `apps/worker/.env` (gitignored):

```bash
export CLOUDFLARE_ACCOUNT_ID=<your account ID>       # Dashboard URL: dash.cloudflare.com/<this>
export CLOUDFLARE_DATABASE_ID=<D1 database_id>       # same value you put in wrangler.jsonc
export CLOUDFLARE_D1_TOKEN=<API token>               # Dashboard → My Profile → API Tokens
                                                     # Create token with "D1 Edit" permission
```

Or as a `.env` file:

```ini
# apps/worker/.env  (gitignored)
CLOUDFLARE_ACCOUNT_ID=<your account ID>
CLOUDFLARE_DATABASE_ID=<D1 database_id>
CLOUDFLARE_D1_TOKEN=<API token>
```

---

## Step 5 — CORS reference

CORS is enforced in two places. Both must allow the same frontend origin(s).

### Worker CORS (`apps/worker/src/index.ts`)

Configured via `hono/cors` middleware. The allowed origins come from `FRONTEND_ORIGIN` in `wrangler.jsonc` (Step 4a). Current settings:

| Header | Value |
|---|---|
| `Access-Control-Allow-Origin` | all origins listed in `FRONTEND_ORIGIN` |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization` |
| `Access-Control-Allow-Credentials` | `true` |
| `Access-Control-Max-Age` | `86400` (24 h) |

### S3 CORS (Step 3c)

The browser uploads directly to S3 with presigned PUT URLs, bypassing the Worker. S3's own CORS policy must allow `PUT` and `GET` from your frontend origin. This is set once via the AWS CLI command in Step 3c.

---

## Step 6 — Apply database migrations

```bash
cd apps/worker
bun run db:migrate:remote
```

This runs `wrangler d1 migrations apply flop-db --remote`, applying all SQL files in `src/db/migrations/` to the live D1 database. Run this once on first deploy and again after any schema changes.

---

## Step 7 — Deploy the Worker

```bash
cd apps/worker
bunx wrangler deploy
```

Wrangler bundles `src/index.ts`, uploads the script plus the `RoomDO` Durable Object class, applies D1 migration tags, and prints the deployed URL:

```
https://flop-worker.<your-subdomain>.workers.dev
```

---

## Step 8 — Build and deploy the frontend

### 8a. Build

```bash
cd apps/web
bun run build
# output → apps/web/dist/
```

### 8b. Deploy to Cloudflare Pages

#### First deploy (creates the project)

```bash
bunx wrangler pages deploy apps/web/dist --project-name flop
```

Wrangler prints your Pages URL: `https://flop.pages.dev` (or similar). Note it — you need it for the CORS steps.

#### Subsequent deploys

```bash
bunx wrangler pages deploy apps/web/dist --project-name flop
```

#### Build entire monorepo at once (alternative)

```bash
# from repo root
bun run build   # turbo build: shared → worker → web
cd apps/worker && bunx wrangler deploy
bunx wrangler pages deploy apps/web/dist --project-name flop
```

### 8c. Custom domain on Pages (optional)

In the Cloudflare Dashboard: **Pages → your project → Custom domains → Set up a custom domain**. Add your domain (e.g. `flop.example.com`) and follow the DNS steps.

After adding a custom domain:
- Add it to `FRONTEND_ORIGIN` in `wrangler.jsonc`
- Add it to the S3 CORS `AllowedOrigins` (Step 3c)
- Redeploy the Worker (`bunx wrangler deploy` in `apps/worker`)

---

## Step 9 — Verify the deployment

```bash
# Worker health (should return 404 for unknown route, proving it's alive)
curl -I https://flop-worker.<your-subdomain>.workers.dev/api/rooms/unknown

# Check CORS preflight from your Pages origin
curl -X OPTIONS https://flop-worker.<your-subdomain>.workers.dev/api/rooms/personal \
  -H "Origin: https://flop.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -v 2>&1 | grep -i "access-control"
# Expect: access-control-allow-origin: https://flop.pages.dev
```

Open the Pages URL in a browser and try creating a personal room and a one-shot send.

---

## Environment variable reference

### Worker (`apps/worker/wrangler.jsonc` — `"vars"`)

| Variable | Type | Example | Notes |
|---|---|---|---|
| `AWS_REGION` | string | `"eu-north-1"` | Must match the S3 bucket region |
| `S3_BUCKET_NAME` | string | `"flop-files"` | Must match the bucket created in Step 3a |
| `FRONTEND_ORIGIN` | string[] | `["https://flop.pages.dev"]` | All allowed CORS origins; include every domain the UI is served from |
| `MAX_FILE_SIZE` | string | `"104857600"` | Max upload in bytes (100 MB = `104857600`) |

### Worker secrets (`wrangler secret put`)

| Secret | Where to get it |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM → User → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY` | Same flow (shown once at creation) |

### Drizzle migration vars (local `.env` / shell only)

| Variable | Where to get it |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard URL or `bunx wrangler whoami` |
| `CLOUDFLARE_DATABASE_ID` | Output of `wrangler d1 create flop-db` or `wrangler.jsonc` |
| `CLOUDFLARE_D1_TOKEN` | Dashboard → My Profile → API Tokens (D1 Edit permission) |

### Frontend (`apps/web`)

No environment variables. The SPA calls `/api/*` paths which are served by the Worker on the same origin in production, and proxied to `http://localhost:8787` in development.

---

## Local development

```bash
# 1. Install
bun install

# 2. Create apps/worker/.dev.vars (gitignored)
cat > apps/worker/.dev.vars << 'EOF'
AWS_ACCESS_KEY_ID=your_key_id
AWS_SECRET_ACCESS_KEY=your_secret_key
EOF

# 3. Apply D1 migrations locally
cd apps/worker && bun run db:migrate:local && cd ../..

# 4. Start everything (Worker on :8787, Vite on :5173)
bun dev
```

The Vite dev server proxies all `/api/*` requests to `http://localhost:8787`.

---

## Re-deploy after changes

| What changed | Command |
|---|---|
| Worker code only | `cd apps/worker && bunx wrangler deploy` |
| Frontend only | `cd apps/web && bun run build && bunx wrangler pages deploy apps/web/dist --project-name flop` |
| DB schema (new migration) | `cd apps/worker && bun run db:migrate:remote && bunx wrangler deploy` |
| Secrets | `cd apps/worker && bunx wrangler secret put <NAME>` |
| `wrangler.jsonc` vars | Edit the file, then `cd apps/worker && bunx wrangler deploy` |
| Everything | `bun run build && cd apps/worker && bunx wrangler deploy && bunx wrangler pages deploy apps/web/dist --project-name flop` |

---

## Troubleshooting

**CORS error in the browser (`No 'Access-Control-Allow-Origin' header`)**
- Check that `FRONTEND_ORIGIN` in `wrangler.jsonc` exactly matches the `Origin` header the browser sends (scheme + host + port, no trailing slash).
- Re-deploy the Worker after editing `wrangler.jsonc`.
- For S3 upload CORS errors, re-run the `aws s3api put-bucket-cors` command from Step 3c with the correct origin.

**`wrangler deploy` fails with "D1 database not found"**
- Make sure `database_id` in `wrangler.jsonc` matches the ID returned by `wrangler d1 create flop-db`.

**`db:migrate:remote` fails with 401**
- `CLOUDFLARE_D1_TOKEN` may be expired or missing the D1 Edit permission. Regenerate it in the Dashboard.

**Worker deploys but returns 500 on file operations**
- Run `bunx wrangler tail` in `apps/worker` to see live logs. Most likely the AWS secrets (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) are missing or incorrect.

**Files upload but download fails**
- The S3 CORS policy may not include `GET`. Re-run Step 3c including `"AllowedMethods": ["PUT", "GET"]`.

**WebSocket / P2P never connects**
- The Durable Object migration (`"tag": "v1"`) must be applied. It is included automatically on `wrangler deploy` when the DO class is new. If you deployed before adding the DO, delete and re-create the Worker, or add a new migration tag in `wrangler.jsonc`.
