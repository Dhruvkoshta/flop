# flop — Setup Guide

End-to-end encrypted file sharing. Files are AES-GCM-256 encrypted in the browser; the decryption key is embedded in the share URL fragment and never sent to the server. Transfer uses WebRTC P2P with automatic fallback to **AWS S3**. Files self-destruct after 24 hours.

---

## Prerequisites

- [Bun](https://bun.sh) — package manager and runtime
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — Cloudflare CLI (installed as a devDependency; `bunx wrangler` or `bun run` scripts work out of the box)
- An **AWS account** with S3 access
- A **Cloudflare account** with Workers, D1, and KV enabled

---

## Environment Variables & Keys

### Worker (`apps/worker`)

Variables are split into two categories: plain config vars (in `wrangler.jsonc`) and secrets (stored via Wrangler, never in files).

#### Config vars — edit in `apps/worker/wrangler.jsonc`

| Variable | Default | Description |
|---|---|---|
| `AWS_REGION` | `"us-east-1"` | AWS region where your S3 bucket lives |
| `S3_BUCKET_NAME` | `"flop-files"` | S3 bucket name for encrypted file storage |
| `FRONTEND_ORIGIN` | `"http://localhost:5173"` | Allowed CORS origin — **must be changed to your production frontend URL before deploying** |
| `MAX_FILE_SIZE` | `"104857600"` | Maximum upload size in bytes (default: 100 MB) |

#### Wrangler binding IDs — also in `apps/worker/wrangler.jsonc`

| Placeholder | What to replace with |
|---|---|
| `REPLACE_WITH_D1_DATABASE_ID` | The D1 database ID returned by `wrangler d1 create flop-db` |
| `REPLACE_WITH_KV_NAMESPACE_ID` | The KV namespace ID returned by `wrangler kv namespace create ALIASES` (production) |
| `REPLACE_WITH_KV_PREVIEW_NAMESPACE_ID` | The preview namespace ID from the same command (for local dev) |

#### Secrets — set via Wrangler, never stored in files

| Secret | How to obtain |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS Console → IAM → Users → your user → Security credentials → Create access key → copy **Access key ID** |
| `AWS_SECRET_ACCESS_KEY` | Same access key creation flow → copy **Secret access key** (shown once) |

Set them:

```bash
cd apps/worker
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

For **local development**, create `apps/worker/.dev.vars` (gitignored):

```ini
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
```

#### Drizzle migration env vars — only needed when running remote migrations

Set these in your shell or a local `.env` file (gitignored) inside `apps/worker/`:

| Variable | Where to find it |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Dashboard URL or `wrangler whoami` |
| `CLOUDFLARE_DATABASE_ID` | Returned by `wrangler d1 create flop-db`, or check `wrangler.jsonc` |
| `CLOUDFLARE_D1_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens → Create Token with D1 Edit permissions |

### Frontend (`apps/web`)

No environment variables. The frontend calls relative API paths (`/api/…`) which are proxied to the Worker in dev and served by the same Worker origin in production.

---

## One-time AWS S3 Setup

### 1. Create the S3 bucket

In the [AWS Console](https://s3.console.aws.amazon.com/) or via AWS CLI:

```bash
aws s3api create-bucket \
  --bucket flop-files \
  --region us-east-1
```

For regions other than `us-east-1`, add `--create-bucket-configuration LocationConstraint=<region>`.

### 2. Block public access

Encrypted blobs are served only via presigned URLs — keep the bucket fully private:

```bash
aws s3api put-public-access-block \
  --bucket flop-files \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 3. Add a CORS policy (required for browser presigned uploads)

```bash
aws s3api put-bucket-cors \
  --bucket flop-files \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["PUT", "GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }]
  }'
```

In production, replace `"*"` in `AllowedOrigins` with your actual frontend URL.

### 4. Set up lifecycle rule (auto-delete after 24 hours)

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

### 5. Create an IAM user and access key

In the [AWS IAM Console](https://console.aws.amazon.com/iam/):

1. **Create a policy** with only the required permissions:

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

2. **Create an IAM user**, attach the policy above, then generate an **Access key** under *Security credentials*.
3. Copy the **Access key ID** and **Secret access key** — you'll need them for the secrets step below.

---

## One-time Cloudflare Infrastructure Setup

Run these once to provision the remaining services. Copy the output IDs into `apps/worker/wrangler.jsonc`.

```bash
# 1. Authenticate with Cloudflare
wrangler login

# 2. Create KV namespace (alias redirects)
#    Copy both IDs into wrangler.jsonc (id and preview_id)
wrangler kv namespace create ALIASES

# 3. Create D1 database (file & alias metadata)
#    Copy the database_id into wrangler.jsonc
wrangler d1 create flop-db

# 4. Set AWS secrets
cd apps/worker
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

After running the above, update `apps/worker/wrangler.jsonc`:

- Replace `REPLACE_WITH_D1_DATABASE_ID` with the D1 database ID
- Replace `REPLACE_WITH_KV_NAMESPACE_ID` with the KV production ID
- Replace `REPLACE_WITH_KV_PREVIEW_NAMESPACE_ID` with the KV preview ID
- Update `AWS_REGION` if your bucket is not in `us-east-1`
- Update `S3_BUCKET_NAME` if you used a different bucket name

---

## Running in Development

### Install dependencies

```bash
bun install
```

### Set up local secrets

Create `apps/worker/.dev.vars`:

```ini
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
```

### Apply database migrations locally

```bash
cd apps/worker
bun run db:migrate:local
```

### Start all services (recommended)

From the repo root — starts the shared type watcher, the Worker on `:8787`, and the Vite frontend on `:5173` concurrently:

```bash
bun dev
```

The Vite dev server proxies `/api/*` and `/u/*` to `http://localhost:8787` automatically.

### Start services individually

```bash
# 1. Shared types watcher (run first, or skip if already built)
cd packages/shared && bun dev

# 2. Worker (Cloudflare local emulator)
cd apps/worker && bun dev          # → http://localhost:8787

# 3. Frontend
cd apps/web && bun dev             # → http://localhost:5173
```

### Other useful worker commands

```bash
cd apps/worker
bun run typecheck          # TypeScript type check (no emit)
bun run types              # Regenerate worker-configuration.d.ts from wrangler.jsonc bindings
bun run db:generate        # Generate new migration SQL from schema changes
bun run clean              # Remove dist/ and .wrangler/ cache
```

---

## Deploying to Production

### 1. Update config for production

In `apps/worker/wrangler.jsonc`, set `FRONTEND_ORIGIN` to your production frontend URL, e.g.:

```jsonc
"FRONTEND_ORIGIN": "https://flop.example.com"
```

Also update the S3 CORS policy to restrict `AllowedOrigins` to that URL.

### 2. Run remote database migrations

```bash
cd apps/worker
# Set these env vars first (see Drizzle migration env vars section above)
bun run db:migrate:remote   # wrangler d1 migrations apply flop-db --remote
```

### 3. Deploy the Worker

```bash
cd apps/worker
bun run deploy              # wrangler deploy
```

### 4. Build the frontend

```bash
cd apps/web
bun run build               # outputs to apps/web/dist/
```

### 5. Deploy the frontend

Choose any static host:

**Cloudflare Pages:**

```bash
wrangler pages deploy apps/web/dist --project-name flop
```

**Vercel / Netlify:**

Connect the repo with:
- Build command: `bun run build` (or `turbo build`)
- Publish directory: `apps/web/dist`
- Root directory: `apps/web` (or leave blank if using turbo from root)

**Any static host:** upload the contents of `apps/web/dist/`.

### Build everything at once

```bash
bun run build    # turbo build → shared → worker → web
```

---

## Architecture Summary

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind | Upload/download UI, AES-GCM-256 crypto, WebRTC |
| API | Cloudflare Workers + Hono | REST endpoints for upload, file metadata, aliases |
| Signaling | Cloudflare Durable Objects | Per-transfer WebSocket rooms for WebRTC handshake |
| File storage | AWS S3 | Encrypted file fallback (presigned PUT/GET, 24h lifecycle) |
| Metadata DB | Cloudflare D1 (SQLite) | `files` and `aliases` tables via Drizzle ORM |
| Alias store | Cloudflare KV | Fast `/u/:alias` redirect lookups |
| NAT traversal | Google STUN servers | WebRTC peer connection setup |
