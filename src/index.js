import { DurableObject } from "cloudflare:workers";

/*
  testGame の Worker
  - 静的ファイルは public/ から配信（ゲームごとにフォルダを分ける）
      /                → ゲーム一覧
      /gattai-drive/   → 合体ドライブ
  - WebSocket だけ Worker が受ける
      /gattai-drive/ws/<部屋コード> → Durable Object「GattaiRoom」
*/

// 合体ドライブの部屋：1部屋 = 1 Durable Object。2人分のWebSocketをつなぐ中継役だけ。
// 物理計算はホスト（slot 0）のスマホが担当する。
export class GattaiRoom extends DurableObject {
  async fetch(request) {
    const { 0: client, 1: server } = new WebSocketPair();

    const sockets = this.ctx.getWebSockets();
    const used = sockets.map((ws) => ws.deserializeAttachment()?.slot);
    const slot = [0, 1].find((i) => !used.includes(i));

    if (slot === undefined) {
      server.accept();
      server.send(JSON.stringify({ t: "full" }));
      server.close(4000, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot });
    server.send(JSON.stringify({ t: "welcome", slot, peer: sockets.length > 0 }));
    for (const ws of sockets) safeSend(ws, JSON.stringify({ t: "peer_join" }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) safeSend(other, message);
    }
  }

  async webSocketClose(ws) {
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) safeSend(other, JSON.stringify({ t: "peer_leave" }));
    }
    try { ws.close(1000, "bye"); } catch {}
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}

function safeSend(ws, data) {
  try { ws.send(data); } catch {}
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/gattai-drive\/ws\/([A-Za-z0-9]{1,12})$/);
    if (m) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected a WebSocket", { status: 426 });
      }
      const id = env.GATTAI_ROOM.idFromName(m[1].toUpperCase());
      return env.GATTAI_ROOM.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
