// 調整する数値はすべてここに置く。単位は px(1マス16px)、マス、フレーム(60F)。
(function (root) {
  root.CFG = {
    T: 16, COLS: 60, ROWS: 36,
    GATE: { c: 0, r: 18 },         // 村の門。火元で、客はここから来て帰る
    NIGHT_F: 5400,                 // 夜の長さ(90秒)
    // 土地。地図を区画に分け、朝に銭で買って開く。門から遠い区画ほど高い
    LAND_W: 6, LAND_H: 6, LAND_OPEN: [[0, 2], [0, 3], [1, 2], [1, 3]], LAND_COST: 200, LAND_COST_STEP: 150,
    // 明るさ。3段に分ける
    LIGHT_BRIGHT: 0.55,            // これ以上は明るい(人だけ)
    LIGHT_DIM: 0.18,               // これ以上は薄暗い(人と妖怪)。未満は暗い(閉店)
    R_LANTERN: 3.4, R_LANTERN_DRY: 2.0, R_JOYA: 2.5,
    FIRE_REACH: 2,                 // 火の通った道から何マス以内に提灯を置けるか(縦横斜め)
    // 油
    OIL_PER_LANTERN: 70, OIL_PER_SEC: 1, OIL_BUY: 60, OIL_BUY_COST: 20,
    RELIGHT_COST: 10,
    // 値段(一定)。取り壊すと半分戻る
    PRICE: { road: 5, lantern: 30, koyatai: 50, yatai: 250, oodana: 1200, nagaya: 120, chaya: 300, shibai: 1500, taiko: 400, yashiro: 400, bansho: 300, joya: 80 },
    REFUND: 0.5,
    START_MONEY: 200,
    // 働き手。門からは村の人が通ってくる。長屋1軒に何人住むか。道で何マスまで通えるか
    GATE_WORKERS: 2, NAGAYA_WORKERS: 3, WORK_REACH: 14,
    // 客(人)。名所が呼ぶ人数は BUILDS の visitors
    HUMAN_BASE: 10, HUMAN_PER_NIGHT: 1, HUMAN_SPEED: 0.6, WALLET: 3,
    BUY_BRIGHT: 0.7, BUY_DIM: 0.4, BUY_BACK: 0.5,   // 寄る割合。奥1マスはさらに掛ける
    ROAM_W: 3,                     // 名所でなく、道の奥へ歩く人の重み
    SERVE_F: 40,                   // 1人に売る時間。働き手1人が同時に1人さばく
    // 賑わい。妖怪1匹に要る目盛り:GAUGE_BASE + 夜ごとに GAUGE_PER_NIGHT、上限 GAUGE_MAX
    GAUGE_BASE: 6, GAUGE_PER_NIGHT: 0.2, GAUGE_MAX: 12,
    YOKAI_CAP_BASE: 2, YOKAI_CAP_PER_NIGHT: 0.5, YOKAI_CAP_MAX: 15,   // 一晩に来る妖怪の上限
    // 妖怪
    YOKAI_PAY: 2,                  // 単価の何倍払うか(相場を知らない)
    YOKAI_SPEED: 0.45, YOKAI_LIFE: 2400, YOKAI_SEEK: 0.6, YOKAI_SEEK_R: 30,
    YOKAI_EAT_RANGE: 3.2, YOKAI_EAT_F: 240, SIT_F: 600,
    // 気まぐれの重み。mult は払いの倍率
    WHIMS: {
      big:    { w: 15, mult: 3,   label: '大盤振る舞い' },
      normal: { w: 30, mult: 1,   label: '' },
      leaf:   { w: 12, mult: 1,   label: '葉っぱ?' },
      eat:    { w: 18, mult: 1,   label: '腹ぺこ' },
      sit:    { w: 10, mult: 1,   label: '居座り' },
      gift:   { w: 7,  mult: 1.6, label: '置き土産' },
      vanish: { w: 8,  mult: 0,   label: 'ふっと消えた' },
    },
    // 建物の範囲(マス)と効果
    BUILD_R: 3,
    CHAYA_BUY: 1.4, TAIKO_GAUGE: 2, YASHIRO_PAY: 1.5, YASHIRO_HUMAN: 0.6,
    // 止め(F)と揺れ
    STOP_YOKAI_BUY: 4, STOP_EAT: 6, SHAKE_EAT: 12,
    // 画面。最初は縦に何マス見せるか、拡大の上限(縦のマス数)
    VIEW_ROWS: 14, VIEW_ROWS_MIN: 6,
    GOAL_NIGHT: 30,
  };

  // 店。単価と、要る働き手の数だけが違う
  root.STALLS = {
    koyatai: { name: '小屋台', price: 10, staff: 1 },
    yatai:   { name: '屋台',   price: 30, staff: 2 },
    oodana:  { name: '大店',   price: 100, staff: 4 },
  };

  // 建物。visitors:名所として毎晩呼ぶ客の数で、目当てにされる重みでもある
  root.BUILDS = {
    nagaya:  { name: '長屋',     desc: '働き手が3人住む' },
    chaya:   { name: '茶屋',     desc: '名所。客が毎晩+4人。範囲の店に人がよく寄る', visitors: 4 },
    shibai:  { name: '芝居小屋', desc: '大きな名所。客が毎晩+12人', visitors: 12 },
    taiko:   { name: '太鼓櫓',   desc: '範囲で売ると賑わい2倍' },
    yashiro: { name: 'お社',     desc: '範囲の妖怪がよく払う。人は寄りにくい' },
    bansho:  { name: '番所',     desc: '範囲に妖怪が入れない' },
    joya:    { name: '常夜灯',   desc: '喰われない灯り。周りは明るいだけ' },
  };
})(window);
