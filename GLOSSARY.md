# Flop Domain Glossary

Flop is an encrypted peer-to-peer and cloud-backed file sharing web application built on Cloudflare Workers, Durable Objects, D1, KV, and R2.

## Language

**Personal Room**:
An owner-managed room identified by a custom room handle, protected by an owner password, and holding multiple encrypted files.
_Avoid_: User room, permanent room, account

**Send Room**:
An ephemeral one-shot transfer room identified by a random room ID, utilizing WebRTC peer-to-peer data channels with encrypted object storage fallback.
_Avoid_: One-time room, temporary room, quick transfer

**Room Handle**:
A unique lowercase alphanumeric string (e.g. `/:handle`) that addresses a Personal Room.
_Avoid_: Username, Room ID, URL slug, User tag

**Owner**:
The creator of a Personal Room who holds the secret password to authorize uploading and deleting files.
_Avoid_: Admin, host, user

**Guest**:
A visitor accessing a Personal Room to view and download decrypted files without owner capabilities.
_Avoid_: Client, receiver, anonymous user
