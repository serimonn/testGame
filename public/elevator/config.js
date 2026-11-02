// 調整する数値はすべてここに置く。単位は px(論理画面 540×960)、フレーム(60F)。
(function (root) {
  root.CFG = {
    W: 540, H: 960,
    // 扉。g は開き(0〜1)。判断のための扉ではないので素早く動かす
    DOOR_OPEN_F: 12, DOOR_CLOSE_F: 14, DOOR_HOLD_F: 8,
    // 廊下
    HALL_D: 330, // 端から扉の正面まで
    ENTER_F: 16,
    LEAVE_SPEED: 3.2,
    LIVES: 3,
    // 止め(F)
    STOP_OK: 3, STOP_MISS: 14, STOP_OVER: 24,
    RAMPAGE_F: 80, // ゾンビを乗せたときの大騒ぎ
    FLOOR_END_F: 30, TRAVEL_F: 66,
    OVER_SKIP_F: 30,
    // 連続正解のほめ言葉
    COMBO_WORDS: { 5: 'いい調子!', 10: '名エレベーター係!', 15: 'ゾンビ絶対通さないマン', 20: '伝説の係員' },
    // 救済:研修中は客の足を遅く、扉の前で待つ時間を長く
    TRAINEE_SPEED: 0.75, TRAINEE_WAIT: 1.5, TRAINEE_SUGGEST_OVERS: 2,
    SHAKE: 1,
  };

  // 客。人間とゾンビ。紛らわしい組と、見分ける手がかりを持たせる
  // zombie:ゾンビか, sp:歩く速さの倍率, tell:見分け方(初登場時に出す)
  root.KINDS = {
    salary:  { name: 'サラリーマン', zombie: false, sp: 1.0,  tell: '人間。開で乗せる' },
    zombie:  { name: 'ゾンビ',       zombie: true,  sp: 0.8,  tell: 'ゾンビ。閉で締め出す' },
    obachan: { name: 'おばあちゃん', zombie: false, sp: 0.65, tell: '人間。足が遅い' },
    tetsuya: { name: '徹夜明け',     zombie: false, sp: 0.75, tell: '顔色は悪いが人間。コーヒーが目印' },
    suitz:   { name: 'スーツゾンビ', zombie: true,  sp: 1.0,  tell: 'スーツでもゾンビ。緑の手を前に出す' },
    pack:    { name: '顔パック',     zombie: false, sp: 0.9,  tell: '顔は白いが人間。手さげかばんが目印' },
    maskz:   { name: 'マスクゾンビ', zombie: true,  sp: 0.85, tell: '人の顔のお面。耳と首が緑' },
  };

  // 階ごとの難しさ。kinds:出る客と重み, n:人数, sp:歩く速さ(px/F), gap:次の客までのF,
  // wait:扉の前で待つF(過ぎると人間は帰り、ゾンビは押し入る), pair:2人同時に来る率,
  // first:この階の最初の客(新しい客を落ち着いて見せる), guide:上に出す一言
  root.FLOORS = [
    { kinds: { salary: 3, zombie: 2 }, n: 5, sp: 2.6, gap: 115, wait: 90, pair: 0, first: ['salary', 'zombie'], guide: '人間は 開 で乗せる。ゾンビは 閉 で締め出す' },
    { kinds: { salary: 3, zombie: 2, obachan: 2 }, n: 6, sp: 2.7, gap: 105, wait: 80, pair: 0, first: ['obachan'], guide: 'おばあちゃんは遅い。あせらず待とう' },
    { kinds: { salary: 2, zombie: 3, obachan: 1, tetsuya: 3 }, n: 7, sp: 2.8, gap: 100, wait: 75, pair: 0, first: ['tetsuya', 'zombie'], guide: '徹夜明けは顔色が悪いが人間。コーヒーを見よ' },
    { kinds: { salary: 3, zombie: 2, tetsuya: 2, suitz: 3 }, n: 7, sp: 3.0, gap: 95, wait: 70, pair: 0, first: ['suitz', 'salary'], guide: 'スーツゾンビは緑の手を前に出している' },
    { kinds: { salary: 2, zombie: 2, obachan: 1, tetsuya: 2, suitz: 2, pack: 3 }, n: 8, sp: 3.0, gap: 90, wait: 66, pair: 0.1, first: ['pack'], guide: '顔パックは白いが人間。手さげかばんを見よ' },
    { kinds: { salary: 2, zombie: 2, obachan: 1, tetsuya: 2, suitz: 2, pack: 2, maskz: 3 }, n: 8, sp: 3.1, gap: 88, wait: 62, pair: 0.15, first: ['maskz', 'obachan'], guide: 'マスクゾンビは耳と首が緑' },
    { kinds: { salary: 2, zombie: 2, obachan: 1, tetsuya: 2, suitz: 2, pack: 2, maskz: 2 }, n: 9, sp: 3.2, gap: 80, wait: 58, pair: 0.3, guide: '2人同時に来る。近い方から決める' },
    { kinds: { salary: 2, zombie: 2, obachan: 1, tetsuya: 3, suitz: 3, pack: 2, maskz: 3 }, n: 10, sp: 3.4, gap: 72, wait: 52, pair: 0.35 },
    { kinds: { salary: 2, zombie: 2, obachan: 1, tetsuya: 3, suitz: 3, pack: 3, maskz: 3 }, n: 12, sp: 3.6, gap: 64, wait: 48, pair: 0.45, guide: '最後の階。社長室まであと少し' },
  ];
  root.TOP_FLOOR = 10;
})(typeof window !== 'undefined' ? window : globalThis);
