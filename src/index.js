import { DurableObject } from "cloudflare:workers";

/*
  testGame の Worker
  - 静的ファイルは public/ から配信（ゲームごとにフォルダを分ける）
      /                → ゲーム一覧
      /gattai-drive/   → 合体ドライブ
  - WebSocket だけ Worker が受ける
      /gattai-drive/ws/<部屋コード>?cid=<端末ごとのID> → Durable Object「GattaiRoom」
*/

// 合体ドライブの部屋：1部屋 = 1 Durable Object。2人分のWebSocketをつなぐ中継役だけ。
// 物理計算はホスト（slot 0）のスマホが担当する。
export class GattaiRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // 接続維持の "ping" には部屋を起こさずに "pong" を返す（課金対象にもならない）
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const cid = (url.searchParams.get("cid") || "").slice(0, 40);
    const { 0: client, 1: server } = new WebSocketPair();

    let sockets = this.ctx.getWebSockets().filter((ws) => !ws.deserializeAttachment()?.replaced);

    // 同じ端末からの再接続：古い接続（電波が切れて残っているもの）を閉じて、同じ席に座らせる
    let slot;
    if (cid) {
      const old = sockets.find((ws) => ws.deserializeAttachment()?.cid === cid);
      if (old) {
        const att = old.deserializeAttachment();
        slot = att.slot;
        old.serializeAttachment({ ...att, replaced: true });
        try { old.close(4001, "replaced"); } catch {}
        sockets = sockets.filter((ws) => ws !== old);
      }
    }
    if (slot === undefined) {
      const used = sockets.map((ws) => ws.deserializeAttachment()?.slot);
      slot = [0, 1].find((i) => !used.includes(i));
    }

    if (slot === undefined) {
      server.accept();
      server.send(JSON.stringify({ t: "full" }));
      server.close(4000, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot, cid });
    server.send(JSON.stringify({ t: "welcome", slot, peer: sockets.length > 0 }));
    for (const ws of sockets) safeSend(ws, JSON.stringify({ t: "peer_join" }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws && !other.deserializeAttachment()?.replaced) safeSend(other, message);
    }
  }

  async webSocketClose(ws) {
    // 再接続で置き換えた古い接続が閉じただけなら、相方には知らせない
    if (!ws.deserializeAttachment()?.replaced) {
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && !other.deserializeAttachment()?.replaced) safeSend(other, JSON.stringify({ t: "peer_leave" }));
      }
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
