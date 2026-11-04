// 調整する数値はすべてここに置く。時間は秒、点は物差しの目盛り(0〜100)。
// ブラウザでも Durable Object でも読み込む(globalThis.MONO_CFG)。
(function (root) {
  root.MONO_CFG = {
    // 1試合
    totalRounds: 5,             // ラウンド数の初期値。配信者がロビーと結果画面で ROUND_CHOICES から選べる
    ROUND_CHOICES: [3, 5, 7, 10],
    guessSeconds: 20,           // お題を出してから締切まで。配信者の答えと視聴者の予想を同時に置く。早期締切はしない
                                // 配信者が最後まで決定しなければ、その時のスライダーの位置(触っていなければ DEFAULT_ANSWER)
    revealAnimSeconds: 10,      // 答え合わせの演出。この間は「次へ」を受け付けない
    talkSeconds: 15,            // 演出の後に話す時間。「次へ」で短縮できる
    DEFAULT_ANSWER: 50,
    // 得点:差 d が [以下, 点] の順に判定。どれにも入らなければ0点
    scoreTiers: [[3, 10], [10, 6], [20, 3]],
    EXACT_DIFF: 3,              // 「ぴったり!」の差
    RANK_RATIO: 0.6,            // 順位の対象になるのは ceil(ラウンド数 × これ) ラウンド以上予想した人
    SCALE_MAX_PER_MATCH: 2,     // 1試合で同じ物差しを使う回数の上限
    RECENT_TOPICS: 30,          // 直近に出したお題は避ける
    // 参加
    maxPlayers: 100,            // これを超えた人は観戦
    NAME_MAX: 12,
    MAX_PER_IP: 3,              // 同じ接続元IPから1試合で参加できる人数(スマホ回線は IP を共有するため1にしない)
    undoKickSeconds: 5,
    KICK_HOURS: 12,             // 除外した端末を再参加させない時間
    IDLE_PAUSE_ROUNDS: 3,       // 配信者が答えに連続して触らなかったら、次のラウンドの前で一時停止
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
    // 練習モードのCPU視聴者:人数、名前、読みのずれ(標準偏差の範囲)
    PRACTICE_BOT_COUNT: 24,
    PRACTICE_BOT_SD: [4, 28],
    PRACTICE_NAMES: ['あんず', 'もっちー', 'たぬき屋', 'ゆずぽん', 'くろまめ', 'しろくま', 'こむぎ', 'なつみかん', 'ぽてと', 'ふくろう', 'さくらもち', 'みずたま',
      'ちくわ', 'のりたま', 'ひよこ豆', 'かぼす', 'つぶあん', 'こしあん', 'ほうじ茶', 'わらびもち', 'はるまき', 'すだち', 'ぎんなん', 'ゆきみ', 'あおさ', 'てんむす',
      'くるみ', 'しらたま', 'とうもろこし', 'ぶどう糖'],
    // 音量(0〜1)
    VOL: { bgm: 0.22, bgmTalk: 0.12, sfx: 0.8, voice: 0.9 },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
