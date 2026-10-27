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

先に入った人のスマホが物理計算をして状態を配信し（走行中は毎秒10回、リザルトは1回だけ）、Durable Object は2人のメッセージを中継するだけです。

通信が途切れたとき：

- 切れた側は自動で再接続を繰り返す（約25秒）。端末ごとのID（`cid`）で入り直すので、ホスト/ゲストの席はそのまま
- 残った側はゲームを一時停止して、相方が戻るのを最大30秒待つ。戻れば続きから再開
- 20秒ごとに `ping` を送って、待機中やリザルト画面で接続が切られないようにしている（サーバーは部屋を起こさずに `pong` を自動で返すので課金されない）
- ゲーム中は画面が自動で消えないようにしている（Screen Wake Lock 対応ブラウザのみ）

### ひとり用

- **ひとりで遊ぶ（CPUと合体）**：片方をCPU相方が担当。通信なし
- **全部ひとりで操作する（練習）**

### カオス要素

- 道路は2車線（左側通行）
- 担当シャッフル（警告あり、スマホが震える）
- 工事中のコーン：片側の車線をふさぐ。はね飛ばせるがピザが揺れる（9秒後に元に戻る）
- 他の車：交差点で気まぐれに曲がる。ぶつかると激突、前をふさぐとクラクション
- オイル溜まり：踏むとツルッと滑り、ハンドルが効きすぎる
- 猫（7匹）：くつろいだり、ふらっと歩いたり、急に道を横切ったりする。速く当たりそうになると猫は飛びのいて無事、車は驚いてスピン
- CPU相方：ときどき「うっかり」1秒ほど暴走する
- 急ブレーキ・激突でピザが崩れる。全損でスコア -30
- リザルトに配達ランク（S：700点以上／A：500／B：300／C：150／D：150未満）と「ふたりの喧嘩度」の称号。結果をXにポストできる（投稿画面が開き、文面は配達数・スコア・称号などから自動で作る）

### 調整しやすい場所（public/gattai-drive/game.js）

| 内容 | 場所 |
|---|---|
| ステージ時間 | `STAGE_TIME` |
| 担当交代の間隔 | `nextShuffle`（`rand(16, 24)`） |
| 猫の数 | `newSim()` の `for (let i = 0; i < 7 ...` |
| 工事区間・オイル・他の車の数 | `placeObstacles()` |
| 道幅・街区の大きさ | `RW`（道幅）、`P`（周期）、`B`（街区の数） |
| 加速・最高速・曲がりやすさ | `stepSim()` の「車の物理」 |
| ランクの境目と名前 | `RANKS` |
| CPUの性格 | `cpuControl()` |
