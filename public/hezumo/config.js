// 調整する数値はすべてここに置く。単位は px、フレーム(60F)、ラジアン。
(function (root) {
  root.CFG = {
    // 土俵
    RING_R: 230, RING_MIN_R: 70,
    SHRINK_START_F: 1200, SHRINK_END_F: 2700,
    START_DIST: 90,
    READY_F: 48,
    // 動き
    FRICTION: 0.965,
    SPIN: 2.2 / 60, CHARGE_SPIN: 0.4,
    RESTITUTION: 0.8,
    // 溜め(c は 0〜1)
    CHARGE_F: 96, DANGER_C: 0.65, CRIT_C: 0.86,
    // 放屁
    POWER_MIN: 0.3,
    RECOIL: 85, BLAST: 235,
    CRIT_MULT: 1.25, OVER_MULT: 1.25, OVER_RECOIL_MULT: 1.5,
    // 1発で受ける速さの上限。中央寄りからは一発で落ちない強さにする
    HIT_V_MAX: 205,
    RANGE_MIN: 130, RANGE_MAX: 380,
    CONE_HALF: 30 * Math.PI / 180,
    WAVE_SPEED: 900 / 60,
    FALLOFF: 0.45,
    RECOVER_F: 20, OVER_RECOVER_F: 45,
    // 屁返し
    PARRY_F: 9, PARRY_MULT: 1, WHIFF_MULT: 1.25,
    // 芋
    IMO_EVERY_F: 360, IMO_R_RATE: 0.8, IMO_POWER: 1.3, IMO_CHARGE: 1.4,
    // 止め(F)
    STOP_HIT_MIN: 4, STOP_HIT_MAX: 14, STOP_PARRY: 16, STOP_KO: 20,
    // 試合
    WINS_2P: 3, WINS_SOLO: 2,
    KO_SHOW_F: 72, KO_SKIP_AFTER_F: 18,
    CHANKO_MASS: 1.35, CHANKO_AFTER_LOSSES: 3,
    // 取組中の説明を出す長さ
    COACH_TIP_F: 270,
    // 見た目
    SHAKE: 0.6,
  };

  // 力士。一言で言える性能にする。
  root.CHARS = {
    imo:   { name: '芋ノ海', copy: '溜めが速いが、暴発も早い', mass: 1, r: 32, chargeMul: 0.72, power: 1, spinMul: 1, recoverMul: 1, color: '#c9843e' },
    omori: { name: '重錘山', copy: '飛ばされにくいが、回りが遅い', mass: 1.22, r: 40, chargeMul: 1.05, power: 1, spinMul: 0.7, recoverMul: 1.1, color: '#8d6b4c' },
    suka:  { name: '透花',   copy: '音も予兆もない。ただし弱い', mass: 0.9, r: 28, chargeMul: 1, power: 0.85, spinMul: 1.1, recoverMul: 1, color: '#d9b49a', silent: true },
    ren:   { name: '連発丸', copy: '小さい屁を連射。一発は軽い', mass: 0.85, r: 28, chargeMul: 0.7, power: 0.72, spinMul: 1.2, recoverMul: 0.2, color: '#e0a878' },
    taiki: { name: '大気',   copy: '地球を覆うガス。風を吹かせる', mass: 1.9, r: 54, chargeMul: 1, power: 1.15, spinMul: 0.6, recoverMul: 1.2, color: '#7fb8c9', wind: { every: 300, len: 70, accel: 190 / 60 } },
  };
  root.PLAYABLE = ['imo', 'omori', 'suka', 'ren'];

  // 番付。AI の癖を段ごとに足す。
  // react:相手を見る遅れ, aimErr:狙いのズレ, parry:屁返し率, care:反動の自滅を避ける率,
  // rescue:土俵際で戻る率, minC/maxC:狙う溜め, slip:溜めすぎる率, idle:構えるまでの間
  root.BANZUKE = [
    { rank: '序ノ口', char: 'omori', oyakata: '棒立ちの新弟子', ai: { react: 40, aimErr: 0.9,  parry: 0,    care: 0.1, rescue: 0,    minC: 0.1, maxC: 0.4,  slip: 0.1,  idle: 110 } },
    { rank: '序二段', char: 'imo',   oyakata: '芋の食べすぎ',   ai: { react: 32, aimErr: 0.7,  parry: 0,    care: 0.3, rescue: 0.1,  minC: 0.3, maxC: 0.85, slip: 0.35, idle: 80 } },
    { rank: '三段目', char: 'ren',   oyakata: '止まらない男',   ai: { react: 26, aimErr: 0.55, parry: 0.05, care: 0.4, rescue: 0.3,  minC: 0.1, maxC: 0.4,  slip: 0.05, idle: 15 } },
    { rank: '幕下',   char: 'suka',  oyakata: '静かなる刺客',   ai: { react: 22, aimErr: 0.42,  parry: 0.1,  care: 0.6, rescue: 0.5,  minC: 0.4, maxC: 0.85, slip: 0.05, idle: 30 } },
    { rank: '十両',   char: 'omori', oyakata: '動かざる壁',     ai: { react: 18, aimErr: 0.3, parry: 0.15, care: 0.7, rescue: 0.7,  minC: 0.5, maxC: 0.9,  slip: 0.05, idle: 25 } },
    { rank: '幕内',   char: 'imo',   oyakata: '会心の芋',       ai: { react: 12, aimErr: 0.18, parry: 0.25, care: 0.8, rescue: 0.85, minC: 0.86, maxC: 0.97, slip: 0.08, idle: 20 } },
    { rank: '横綱',   char: 'ren',   oyakata: '屁の求道者',     ai: { react: 10, aimErr: 0.13, parry: 0.4,  care: 0.9, rescue: 0.95, minC: 0.2, maxC: 0.9,  slip: 0.02, idle: 8 } },
    { rank: '千秋楽', char: 'taiki', oyakata: '世界の大気',     ai: { react: 12, aimErr: 0.16, parry: 0.2,  care: 0.9, rescue: 0.95, minC: 0.5, maxC: 0.95, slip: 0.02, idle: 20 } },
  ];

  root.KIMARITE = {
    hohi:   { name: '放屁出し',   hint: '屁で押し出す' },
    kaishin:{ name: '会心出し',   hint: '暴発寸前の一発で決める' },
    hekaeshi:{ name: '屁返し',    hint: '受ける瞬間に放つ' },
    hara:   { name: '腹下し',     hint: '相手が溜めすぎて自滅する' },
    hando:  { name: 'すかし落とし', hint: '相手が反動で自滅する' },
    imo:    { name: '芋あたり',   hint: '芋の力で決める' },
    butsu:  { name: '尻ぶちかまし', hint: '体をぶつけて出す' },
    dohyo:  { name: '土俵割り',   hint: '狭くなった土俵から相手が消える' },
  };

  root.SKINS = [
    { id: 'normal',  name: 'ふつうの屁', unlock: 0 },
    { id: 'horagai', name: '法螺貝',     unlock: 3 },
    { id: 'taiko',   name: '和太鼓',     unlock: 6 },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
