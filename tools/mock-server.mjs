// wrangler 無しで試すための簡易サーバー（依存パッケージなし）
// src/index.js の Durable Object と同じ中継ルールを Node で再現する。
//   node tools/mock-server.mjs  → http://localhost:8787
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PUB = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
const PORT = +process.env.PORT || 8787;
const rooms = new Map(); // code -> [{sock, slot}]
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname;
  if (!path.extname(p) && fs.existsSync(path.join(PUB, p, "index.html"))) { res.writeHead(307, { location: p + "/" }); return res.end(); }
  const f = path.join(PUB, path.normalize(p));
  if (!f.startsWith(PUB) || !fs.existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

server.on("upgrade", (req, sock) => {
  const m = new URL(req.url, "http://x").pathname.match(/^\/gattai-drive\/ws\/([A-Za-z0-9]{1,12})$/);
  if (!m) return sock.destroy();
  const accept = crypto.createHash("sha1")
    .update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);

  const code = m[1].toUpperCase();
  const room = rooms.get(code) || [];
  rooms.set(code, room);
  const used = room.map((c) => c.slot);
  const slot = [0, 1].find((i) => !used.includes(i));
  if (slot === undefined) { sendText(sock, JSON.stringify({ t: "full" })); return sock.end(); }

  const me = { sock, slot };
  const others = room.slice();
  room.push(me);
  sendText(sock, JSON.stringify({ t: "welcome", slot, peer: others.length > 0 }));
  for (const o of others) sendText(o.sock, JSON.stringify({ t: "peer_join" }));

  let buf = Buffer.alloc(0);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    const i = room.indexOf(me); if (i >= 0) room.splice(i, 1);
    for (const o of room) sendText(o.sock, JSON.stringify({ t: "peer_leave" }));
    sock.destroy();
  };
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const fr = parseFrame(buf);
      if (!fr) break;
      buf = buf.subarray(fr.len);
      if (fr.op === 8) return close();
      if (fr.op === 1) for (const o of room) if (o !== me) sendText(o.sock, fr.data.toString());
    }
  });
  sock.on("close", close);
  sock.on("error", close);
});

function parseFrame(b) {
  if (b.length < 2) return null;
  const op = b[0] & 0x0f, masked = b[1] & 0x80;
  let n = b[1] & 0x7f, off = 2;
  if (n === 126) { if (b.length < 4) return null; n = b.readUInt16BE(2); off = 4; }
  else if (n === 127) { if (b.length < 10) return null; n = Number(b.readBigUInt64BE(2)); off = 10; }
  const maskOff = off; if (masked) off += 4;
  if (b.length < off + n) return null;
  const data = Buffer.from(b.subarray(off, off + n));
  if (masked) for (let i = 0; i < n; i++) data[i] ^= b[maskOff + (i & 3)];
  return { op, data, len: off + n };
}
function sendText(sock, str) {
  const p = Buffer.from(str);
  let h;
  if (p.length < 126) h = Buffer.from([0x81, p.length]);
  else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(p.length, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
  try { sock.write(Buffer.concat([h, p])); } catch {}
}

server.listen(PORT, "0.0.0.0", () => console.log(`mock server: http://localhost:${PORT}`));
