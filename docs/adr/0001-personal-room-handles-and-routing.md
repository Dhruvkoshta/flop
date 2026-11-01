# 1. Personal Room Handles, KV Edge Lookups, and Routing

Date: 2026-11-01

## Status

Accepted

## Context

Flop previously routed personal rooms under `/u/:alias`. Additionally:
1. Expired room aliases were retaining old room/file records in D1, which could lead to conflicts or residual state upon re-creation.
2. Checking room handle availability was only performed on form submission rather than in real time, causing avoidable friction during creation.
3. Users had to manually click "Enter Room" after creation and re-enter the password they just created to unlock owner privileges.
4. The user wanted top-level clean routes (`/:alias`) rather than nested (`/u/:alias`).

## Decision

1. **Top-Level Room Handles**:
   - Personal rooms are now accessed directly at `/:alias`.
   - Legacy `/u/:alias` routes are redirected to `/:alias`.
   - Reserved route keywords (`personal`, `send`, `r`, `api`, `assets`, `favicon.ico`, `robots.txt`, `u`) cannot be claimed as aliases.

2. **KV-Backed Real-Time Handle Availability**:
   - Active handles are stored in `KV_ALIASES` with a key expiration TTL matching the room's expiration timestamp.
   - A dedicated edge endpoint `GET /api/aliases/check/:alias` checks `KV_ALIASES` (and falls back to D1 for unexpired records) to return availability instantly.
   - Frontend inputs debounce queries against this endpoint as the user types.

3. **Expired Handle Re-availability & Cleanup**:
   - If an alias is requested that belongs to an expired room, the existing alias row and associated expired room & R2 objects are cleaned up, permitting immediate re-creation.

4. **Seamless Owner Post-Creation Redirection**:
   - Upon successful creation, the user is navigated immediately to `/:alias` with the owner password saved in session state so the owner UI is unlocked on entry.

## Consequences

- Clean and concise user-facing URLs for personal rooms.
- Sub-50ms edge responses for handle availability checks during room creation.
- Zero leftover database/storage leaks when reclaiming expired handles.
- Smooth onboarding flow from creation directly into owner view.
