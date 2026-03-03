# flop

**Privacy-first, end-to-end encrypted file sharing — no accounts, no cookies, no server-side plaintext.**

All encryption and decryption happens entirely in the browser using the Web Crypto API (AES-GCM-256). The server never sees your file contents.

---

## How It Works

flop has two sharing modes:

### Personal Room
Claim a permanent, human-readable URL (e.g., `/u/yourname`). You authenticate with a password to upload and manage files. Anyone with the link can browse and download. Files expire after 24 hours, 7 days, or 30 days.

### One-Shot Send
Encrypt a file in your browser, generate a share link, and send it. The transfer is **WebRTC peer-to-peer first** (if you're still online) with an **automatic fallback to S3** if P2P fails. Everything self-destructs after 24 hours.

---

## Security Model

- **AES-GCM-256** encryption via the browser's native `SubtleCrypto` API — no third-party crypto libraries
- Wire format: `[12-byte IV][ciphertext + 16-byte GCM auth tag]` — only 28 bytes of overhead per file
- Passwords are hashed **client-side with SHA-256** before transmission; the server only stores the hash
- The server never proxies file bytes — uploads go directly from your browser to S3 via presigned URLs
- No cookies, no accounts, no tracking

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS, React Router DOM 7 |
| UI Primitives | Radix UI, Lucide React |
| Crypto | Web Crypto API (SubtleCrypto) |
| P2P Transfer | WebRTC (RTCPeerConnection + RTCDataChannel) |
| Backend | Cloudflare Workers, Hono |
| Stateful Signaling | Cloudflare Durable Objects (WebSocket hibernation) |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM |
| Cache | Cloudflare KV |
| File Storage | AWS S3 (presigned URLs, 24h lifecycle rules) |
| Monorepo | Turborepo + Bun |
| Deploy | Cloudflare Workers + Cloudflare Pages |

---

## Architecture

```
Browser
  │
  ├── Encrypts file (AES-GCM-256, SubtleCrypto)
  │
  └── Uploads ciphertext directly → AWS S3 (presigned PUT URL)
        │
        └── Cloudflare Worker (Hono)
              ├── Cloudflare D1       — room & file metadata
              ├── Cloudflare KV       — alias → roomId lookups
              ├── Cloudflare DO       — per-room WebSocket signaling + 24h alarm
              └── AWS S3              — encrypted file storage
```

For send rooms, a Cloudflare Durable Object maintains the WebSocket signaling channel for WebRTC negotiation. If P2P succeeds, the file streams directly between browsers. If P2P times out (20 seconds), the receiver falls back to downloading the encrypted blob from S3.

---

## Project Structure

```
flop/
├── apps/
│   ├── web/          — React SPA (Vite + Tailwind)
│   └── worker/       — Cloudflare Worker (Hono + Durable Objects + D1)
├── packages/
│   └── shared/       — Shared TypeScript types (API shapes, WS messages, state machine phases)
├── SETUP.md          — Local development guide
└── DEPLOY.md         — Production deployment guide
```

---

## Getting Started

See **[SETUP.md](./SETUP.md)** for full local development instructions, including:
- Prerequisites (Bun, Wrangler, AWS + Cloudflare accounts)
- S3 bucket setup (CORS policy, lifecycle rules, IAM)
- Cloudflare infrastructure setup (D1, KV, Durable Objects, secrets)
- Running `bun dev` to start the Worker and Vite dev server

See **[DEPLOY.md](./DEPLOY.md)** for the full production deployment guide.

---

## Key Details

| Property | Value |
|---|---|
| Max file size | 100 MB |
| Encryption | AES-GCM-256, 96-bit random IV |
| Send room lifetime | 24 hours (auto-deleted by DO alarm + S3 lifecycle) |
| Personal room lifetime | 24h / 7d / 30d (configurable) |
| P2P chunk size | 16 KB with 1 MB backpressure threshold |
| P2P fallback timeout | 20 seconds |
| Password storage | SHA-256 hash only, computed client-side |

---

## License

MIT
