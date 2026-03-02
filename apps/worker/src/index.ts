import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./RoomDO";
import { roomRouter } from "./routes/room";
import { aliasRouter } from "./routes/alias";
import { fileRouter } from "./routes/file";

// Re-export the Durable Object class — wrangler requires it as a named export
export { RoomDO } from "./RoomDO";

const app = new Hono<{ Bindings: Env }>();

// ── Global middleware ─────────────────────────────────────────────────────────

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.FRONTEND_ORIGIN;
      if (!origin) return "";
      if (Array.isArray(allowed)) {
        return allowed.includes(origin) ? origin : "";
      }
      return origin === allowed ? origin : "";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
    credentials: true,
  }),
);

app.use("*", secureHeaders());

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/api/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// ── API routes ────────────────────────────────────────────────────────────────

app.route("/api/rooms", roomRouter);
app.route("/api/aliases", aliasRouter);
app.route("/api/file", fileRouter);

// ── WebSocket signaling (RoomDO) ──────────────────────────────────────────────
//
// Route: GET /api/room/:roomId/ws?role=sender|receiver
// Upgrades to WebSocket and hands off to the RoomDO for that roomId.

app.get("/api/room/:roomId/ws", async (c) => {
  const roomId = c.req.param("roomId");
  const role = c.req.query("role");

  if (!role || (role !== "sender" && role !== "receiver")) {
    return c.json({ error: "role must be 'sender' or 'receiver'" }, 400);
  }

  const stub = c.env.ROOM_DO.getByName(roomId);
  const url = new URL(c.req.url);
  url.searchParams.set("role", role);
  return stub.fetch(new Request(url.toString(), c.req.raw));
});



app.notFound((c) => {
  // Pass non-API requests through to the static asset binding (SPA).
  // The ASSETS binding handles index.html fallback for client-side routes.
  if (!c.req.path.startsWith("/api")) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
});

export default app;
