# testGame

Cloudflare Workers で動くブラウザゲーム置き場。ゲームごとにURLを分けています。

| URL | 中身 |
|---|---|
| `/` | ゲーム一覧 |
| `/gattai-drive/` | 合体ドライブ（2人オンライン / CPUとひとりで） |
| `/gattai-drive/ws/<部屋コード>` | 合体ドライブの対戦用WebSocket（Durable Object） |

## 構成

```
public/                      静的ファイル（そのまま配信）
  index.html                 ゲーム一覧
  gattai-drive/              合体ドライブ
    index.html / style.css / game.js
src/index.js                 Worker本体 + Durable Object（GattaiRoom）
wrangler.jsonc               Cloudflare設定
tools/mock-server.mjs        wrangler無しで試せる簡易サーバー（依存なし）
tools/build-artifact.mjs     オフライン1ファイル版を dist/ に作る
```

## 公開

GitHub の main に push すると、Cloudflare（Workers Builds）が `npx wrangler deploy` を実行して公開されます。

- `wrangler.jsonc` の `name` は Cloudflare 側の Worker 名と同じにしてください（今は `testgame`）
- Durable Objects は Workers 無料プランで使えます（SQLite版）

手元から直接デプロイする場合：

```bash
npm install
npx wrangler login
npx wrangler deploy
```

## ローカルで試す

```bash
npm run dev     # wrangler dev
npm run mock    # wranglerが無くても動く簡易サーバー
```

`http://localhost:8787/gattai-drive/` を開く。同じWi-Fiのスマホからは `http://<PCのIP>:8787/gattai-drive/`。

## ゲームを増やすとき

1. `public/<ゲーム名>/` にファイルを置く（中のリンクは相対パスで書く）
2. `public/index.html` の一覧にリンクを足す
3. 通信が必要なら `src/index.js` に `/<ゲーム名>/ws/...` のルートと Durable Object を追加し、`wrangler.jsonc` の `run_worker_first` と `durable_objects`、`migrations`（新しい tag で）に足す

---

## 合体ドライブ

1台の車を2台のスマホで運転するバカゲー。片方はハンドルだけ、もう片方はアクセルとブレーキだけ。90秒でピザを何枚届けられるか。

### 遊び方（2人）

1. ひとりが「部屋をつくる」→ 招待リンクを送る
2. もうひとりがリンクを開く（またはコード入力）と自動でスタート
3. 担当はランダム。約20秒ごとに、2秒前の警告のあと担当が入れ替わる
4. 🏠の円の中で **止まる** と配達完了。熱いうちに、崩さずに届けるほど高得点

先に入った人のスマホが物理計算をして毎秒20回状態を配信し、Durable Object は2人のメッセージを中継するだけです。

### ひとり用

- **ひとりで遊ぶ（CPUと合体）**：片方をCPU相方が担当。通信なし
- **全部ひとりで操作する（練習）**

### カオス要素

- 担当シャッフル（警告あり、スマホが震える）
- 牛：速く当たると車ごと空を飛ぶ
- おばあちゃん：半分の確率で正解と逆の方向を自信満々に言う
- CPU相方：ときどき「うっかり」暴走し、おばあちゃんの嘘を40%で信じる
- 急ブレーキ・激突でピザが崩れる。全損でスコア -30
- リザルトに「ふたりの喧嘩度」と称号

### 調整しやすい場所（public/gattai-drive/game.js）

| 内容 | 場所 |
|---|---|
| ステージ時間 | `STAGE_TIME` |
| 担当交代の間隔 | `nextShuffle`（`rand(16, 24)`） |
| 牛の数 | `newSim()` の `for (let i = 0; i < 14 ...` |
| 加速・最高速・曲がりやすさ | `stepSim()` の「車の物理」 |
| おばあちゃんの台詞 | `GRANNY_FREE` |
| CPUの性格 | `cpuControl()`、`CPU_LINES` |
