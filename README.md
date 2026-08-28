# WebSocket starter for Railway

A WebSocket server on Node 24 and TypeScript, sharing one port with an HTTP
endpoint — which is what makes it deployable.

## Why this exists

The Node.js WebSocket template on Railway builds from a repository last updated in
September 2024, with esbuild 0.17 and a pnpm bundling pipeline. Under four
deployments in ten come up.

The deeper problem is structural: it serves WebSockets and nothing else. A
platform health check speaks plain HTTP, so a WebSocket-only process has nothing
to answer it with — the deployment gets marked unhealthy while working perfectly,
or you turn the check off and lose the signal entirely.

Here the WebSocket server is attached to a Node HTTP server. The same port
answers `GET /health`, serves a test client, and upgrades connections to
WebSocket. On a platform that routes one port per service, that is the shape the
app has to have.

## What's in here

| File | Why it exists |
|------|---------------|
| `src/index.ts` | HTTP server, WebSocket server, broadcast, heartbeat, shutdown |
| `public/index.html` | A browser client to test with — connects, reconnects, sends |
| `railway.json` | Health check on `/health`, restart on failure |
| `.node-version` | Pins Node, so a new major release upstream cannot change the build under you |

Three details worth keeping:

- **Heartbeat.** Clients disappear without closing the socket — a laptop lid, a
  dropped mobile connection. Without a ping/pong sweep the server holds those
  sockets forever and the connection count drifts away from reality.
- **Payloads are capped.** A message is truncated to 4 KB before it is
  broadcast, so one client cannot push arbitrary volume at everyone else.
- **Graceful shutdown closes sockets with code 1001** ("going away") before the
  process exits, so clients reconnect immediately instead of waiting for a
  timeout to notice.

## Try it

Open the domain — the page connects over `wss://` automatically. Open it in a
second tab and the two exchange messages.

`GET /health` reports the current connection count, which is a genuinely useful
thing to have on a socket server.

## Run locally

```bash
npm ci
npm run dev        # http://localhost:8080
```

## Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | no | Defaults to 8080; HTTP and WebSocket share it |
| `HEARTBEAT_MS` | no | Ping interval, default 30000 |

## Scaling note

Broadcast is in-process: a message reaches the clients connected to *this*
instance. With more than one replica you need a shared bus — Redis pub/sub is the
usual answer — to fan messages out across them.

## License

MIT
