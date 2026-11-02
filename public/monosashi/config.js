// 調整する数値はすべてここに置く。時間は秒、点は物差しの目盛り(0〜100)。
// ブラウザでも Durable Object でも読み込む(globalThis.MONO_CFG)。
(function (root) {
  root.MONO_CFG = {
    // 1試合
    totalRounds: 5,
    prepareSeconds: 10,         // 配信者が答えを置く時間。未操作なら DEFAULT_ANSWER で確定
    guessSeconds: 20,           // 予想の時間。早期締切はしない(遅延の大きい人が声のヒントを聞けるように)
    revealAnimSeconds: 10,      // 答え合わせの演出。この間は「次へ」を受け付けない
    talkSeconds: 15,            // 演出の後に話す時間。「次へ」で短縮できる
    DEFAULT_ANSWER: 50,
    // 得点:差 d が [以下, 点] の順に判定。どれにも入らなければ0点
    scoreTiers: [[3, 10], [10, 6], [20, 3]],
    EXACT_DIFF: 3,              // 「ぴったり!」の差
    minRoundsForRanking: 3,     // ceil(totalRounds × 0.6)
    SCALE_MAX_PER_MATCH: 2,     // 1試合で同じ物差しを使う回数の上限
    RECENT_TOPICS: 30,          // 直近に出したお題は避ける
    // 参加
    maxPlayers: 10,             // 11人目以降は観戦
    NAME_MAX: 12,
    APPROVAL_DEFAULT: true,
    MAX_PER_IP: 3,              // 同じ接続元IPから1試合で参加できる人数(スマホ回線は IP を共有するため1にしない)
    undoKickSeconds: 5,
    KICK_HOURS: 12,             // 除外した端末を再参加させない時間
    IDLE_PAUSE_ROUNDS: 3,       // 配信者が prepare で連続して操作しなかったら一時停止
    // 通信
    GUESS_PER_SEC: 2,           // guess と host_answer は1接続あたり毎秒この回数まで
    COUNT_INTERVAL_MS: 1000,    // 予想済み人数の送信間隔の下限
    SYNC_HISTORY_MAX: 50,
    SYNC_HISTORY_SHOW: 5,
    PING_MS: 20000,
    RETRY_MS: 1500,
    // シンクロ率の評価(以上, 言葉)
    syncWords: [[95, '以心伝心'], [85, 'かなりわかってる'], [70, 'だいたい合ってる'], [50, 'ちょっとズレてる'], [0, '感覚がバラバラ']],
    // 表示名のNGワード(ひらがな、小文字に直してから部分一致)
    NG_WORDS: ['しね', 'ころす', 'ころせ', 'きえろ', 'うざい', 'きもい', 'ばか', 'あほ', 'くず', 'かす', 'ちんこ', 'ちんぽ', 'まんこ', 'おっぱい', 'せっくす', 'えっち', 'れいぷ', 'うんこ', 'fuck', 'shit', 'sex', 'dick', 'porn', 'nigger', 'nigga', 'bitch', 'きちがい', 'がいじ', 'しょうがいしゃ', 'ちょん', 'しなちく', 'http', 'www', '.com'],
    // 練習モードのCPU視聴者:名前と読みのずれ(標準偏差)
    PRACTICE_BOTS: [['あんず', 5], ['もっちー', 9], ['たぬき屋', 14], ['ゆずぽん', 20], ['くろまめ', 28], ['しろくま', 11]],
    // 音量(0〜1)
    VOL: { bgm: 0.22, bgmTalk: 0.12, sfx: 0.8, voice: 0.9 },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
