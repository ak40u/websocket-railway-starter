import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { WebSocketServer, type WebSocket } from "ws"

const port = Number(process.env.PORT ?? 8080)
const heartbeatMs = Number(process.env.HEARTBEAT_MS ?? 30_000)

// One port has to serve both. Railway routes a single port per service, and a
// health check speaks plain HTTP - a WebSocket-only process has nothing to answer
// it with, so the deployment is marked unhealthy while working perfectly.
const page = readFileSync(join(import.meta.dirname, "..", "public", "index.html"))

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify({ status: "ok", clients: wss.clients.size }))
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(page)
})

const wss = new WebSocketServer({ server })

// Clients disappear without closing the socket - a laptop lid, a lost mobile
// connection. Without a heartbeat the server keeps those sockets forever and the
// client count drifts away from reality.
const alive = new WeakMap<WebSocket, boolean>()

const broadcast = (payload: unknown, except?: WebSocket) => {
  const message = JSON.stringify(payload)
  for (const client of wss.clients) {
    if (client !== except && client.readyState === client.OPEN) client.send(message)
  }
}

wss.on("connection", (socket) => {
  alive.set(socket, true)
  socket.on("pong", () => alive.set(socket, true))

  socket.send(JSON.stringify({ type: "welcome", clients: wss.clients.size }))
  broadcast({ type: "joined", clients: wss.clients.size }, socket)

  socket.on("message", (data, isBinary) => {
    if (isBinary) return
    let text: string
    try {
      const parsed = JSON.parse(data.toString())
      text = typeof parsed?.message === "string" ? parsed.message : data.toString()
    } catch {
      text = data.toString()
    }
    // Cap the payload so one client cannot push arbitrary volume to everyone else.
    broadcast({ type: "message", message: text.slice(0, 4096) })
  })

  socket.on("close", () => broadcast({ type: "left", clients: wss.clients.size }))
})

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (alive.get(socket) === false) {
      socket.terminate()
      continue
    }
    alive.set(socket, false)
    socket.ping()
  }
}, heartbeatMs)

server.listen(port, () => console.log(`listening on ${port}`))

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    clearInterval(heartbeat)
    for (const socket of wss.clients) socket.close(1001, "server shutting down")
    server.close(() => process.exit(0))
  })
}
