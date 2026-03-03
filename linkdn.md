I built flop — a privacy-first file sharing app where the server never sees your files.
Everything is encrypted in the browser using AES-GCM-256 before a single byte leaves your device. No accounts. No cookies. No tracking.
Two ways to share:
Personal Rooms — claim a permanent URL like /u/yourname, protect it with a password, and anyone with the link can download your files. Files auto-expire in 24h, 7 days, or 30 days.
One-Shot Send — encrypt a file, share a link, and it self-destructs in 24 hours. The transfer attempts WebRTC peer-to-peer first (direct browser-to-browser), and falls back to S3 automatically if P2P fails or the sender goes offline.
Some technical decisions I'm proud of:
- The encryption uses the browser's native SubtleCrypto API — no third-party crypto libraries. Wire format is just [12-byte IV][ciphertext + 16-byte auth tag], adding 28 bytes of overhead per file.
- Passwords are SHA-256 hashed client-side before transmission. The server only ever stores the hash.
- File uploads go directly from the browser to S3 via presigned PUT URLs — the Worker never proxies the bytes.
- WebRTC uses a Cloudflare Durable Object as the signaling server with WebSocket hibernation, so it doesn't burn idle compute.
- The DO also schedules a 24h alarm that deletes all S3 objects, D1 records, and closes any open sockets — no cron jobs needed.
Stack: React 19 + Hono on Cloudflare Workers + D1 + KV + Durable Objects + AWS S3, bundled as a Turborepo monorepo with Bun.
The entire backend runs at the edge with zero cold starts. Total infra cost at low-to-moderate usage: basically nothing.
Privacy shouldn't require trusting the server. flop is proof that it doesn't have to.
GitHub link
#webdev #cloudflare #privacy #typescript #react #webrtc #opensource