// ドット絵。文字1つが1ドット。y は闇の上に重ねて光らせる色(妖怪の目、窓、火)。
(function (root) {
  const PAL = {
    k: '#1a1420', r: '#c8321f', R: '#ff6a3d', o: '#ffb02e', y: '#ffe14d', w: '#f4ecd8',
    b: '#7a5234', B: '#4a3020', g: '#3c6b3a', G: '#5f9a48', s: '#7c7c88', S: '#b9bec7',
    p: '#f08cb4', P: '#c85a8c', v: '#7a4fa8', V: '#b48ae0', n: '#2b2f5a', e: '#f0d0a8',
    h: '#2a1e1a', t: '#c9a46a', m: '#ffffff', c: '#6fd6c8', a: '#3a7ac8', l: '#e8e070',
  };
  const GLOW = 'y';

  // rows:文字列の配列, sub:文字の置き換え, outline:外側に1ドットの縁を付ける
  function make(rows, sub, outline) {
    rows = rows.map(r => sub ? [...r].map(ch => sub[ch] || ch).join('') : r);
    const pad = outline ? 1 : 0;
    const w = rows[0].length + pad * 2, h = rows.length + pad * 2;
    const img = cv(w, h), glow = cv(w, h);
    const x = img.getContext('2d'), gx = glow.getContext('2d');
    const at = (c, r) => rows[r - pad] && rows[r - pad][c - pad] && rows[r - pad][c - pad] !== '.';
    if (outline) {
      x.fillStyle = PAL.k;
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        if (at(c, r)) continue;
        if (at(c - 1, r) || at(c + 1, r) || at(c, r - 1) || at(c, r + 1)) x.fillRect(c, r, 1, 1);
      }
    }
    let hasGlow = false;
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '.') return;
      x.fillStyle = PAL[ch] || ch; x.fillRect(c + pad, r + pad, 1, 1);
      if (ch === GLOW) { gx.fillStyle = PAL.y; gx.fillRect(c + pad, r + pad, 1, 1); hasGlow = true; }
    }));
    return { img, glow: hasGlow ? glow : null, w, h };
  }
  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  const S = {};
  S.lantern = make([
    '......kk........',
    '.....kkkkk......',
    '....kRRRRRk.....',
    '...kRrrrrrRk....',
    '...kkkkkkkkk....',
    '...kRrwwwrRk....',
    '...krwrrrwrk....',
    '...kkkkkkkkk....',
    '...kRrrrrrRk....',
    '....krrrrrk.....',
    '.....kkkkk......',
    '......kbk.......',
    '......kbk.......',
    '......kbk.......',
    '.....kbBbk......',
    '....kkkkkkk.....',
  ]);
  S.lanternOut = make([
    '......kk........',
    '.....kkkkk......',
    '....ksssssk.....',
    '...kshhhhhsk....',
    '...kkkkkkkkk....',
    '...kshhhhhsk....',
    '...khhhhhhhk....',
    '...kkkkkkkkk....',
    '...kshhhhhsk....',
    '....khhhhhk.....',
    '.....kkkkk......',
    '......kbk.......',
    '......kbk.......',
    '......kbk.......',
    '.....kbBbk......',
    '....kkkkkkk.....',
  ]);

  // 屋台。X:のれんの色、Z:品物
  const STALL = [
    '................',
    '.kkkkkkkkkkkkkk.',
    'kXwXwXwXwXwXwXwk',
    'kXwXwXwXwXwXwXwk',
    '.kXkXkXkXkXkXkk.',
    '.kb..........bk.',
    '.kb.ZZ.ZZ.ZZ.bk.',
    '.kb.ZZ.ZZ.ZZ.bk.',
    'kkkkkkkkkkkkkkkk',
    'kbbbbbbbbbbbbbbk',
    'kBBBBBBBBBBBBBBk',
    'kbbbbbbbbbbbbbbk',
    'kbBBBBBBBBBBBBbk',
    'kbbbbbbbbbbbbbbk',
    '.kk..........kk.',
    '................',
  ];
  S.yakitori = make(STALL, { X: 'r', Z: 'b' });
  S.wataame = make(STALL, { X: 'p', Z: 'm' });
  S.omen = make(STALL, { X: 'v', Z: 'w' });
  S.chaya = make(STALL, { X: 'G', Z: 'c' });
  // 第3版の店。単価で見た目が変わる
  S.koyatai = make(STALL, { X: 'r', Z: '.' });
  S.yatai = make([
    '..kkkkkkkkkkkk..',
    '.kRkkkkkkkkkkRk.',
    'kXwXwXwXwXwXwXwk',
    'kXwXwXwXwXwXwXwk',
    '.kXkXkXkXkXkXkk.',
    '.kb..........bk.',
    '.kb..........bk.',
    '.kb..........bk.',
    'kkkkkkkkkkkkkkkk',
    'kbbbbbbbbbbbbbbk',
    'kBoBBBBBBBBBBoBk',
    'kbbbbbbbbbbbbbbk',
    'kbBBBBBBBBBBBBbk',
    'kbbbbbbbbbbbbbbk',
    '.kk..........kk.',
    '................',
  ], { X: 'a' });
  S.oodana = make([
    '..kkkkkkkkkkkk..',
    '.kBBBBBBBBBBBBk.',
    'kBBBBBBBBBBBBBBk',
    'kkkkkkkkkkkkkkkk',
    '.kwwwwwwwwwwwwk.',
    '.kwyywwyywwyywk.',
    '.kwyywwyywwyywk.',
    '.kkkkkkkkkkkkkk.',
    'kRrRrRrRrRrRrRrk',
    'kRrRrRrRrRrRrRrk',
    '.krkrkrkrkrkrkk.',
    '.kb..........bk.',
    '.kb..........bk.',
    '.kb..........bk.',
    'kkkkkkkkkkkkkkkk',
    'kbbbbbbbbbbbbbbk',
    'kBBBBBBBBBBBBBBk',
    '.kk..........kk.',
  ]);
  S.shibai = make([
    '......kkkk......',
    '....kkrrrrkk....',
    '..kkrrrrrrrrkk..',
    'kkrrrrrrrrrrrrkk',
    'kkkkkkkkkkkkkkkk',
    '.kyk.kpk.kyk.kpk',
    '.kyk.kpk.kyk.kpk',
    '.kyk.kpk.kyk.kpk',
    'kkkkkkkkkkkkkkkk',
    'kbwwwwwwwwwwwwbk',
    'kbwRwwRwwRwwRwbk',
    'kbwwwwwwwwwwwwbk',
    'kbbbbbkkkkbbbbbk',
    'kbbbbbkyykbbbbbk',
    'kbbbbbkyykbbbbbk',
    'kkkkkkkkkkkkkkkk',
  ]);
  S.ido = make([
    '................',
    '..kkkkkkkkkkkk..',
    '.kbbbbbbbbbbbbk.',
    'kbbbbbbbbbbbbbbk',
    'kkkkkkkkkkkkkkkk',
    '...kbk....kbk...',
    '...kbk.kk.kbk...',
    '...kbk.ks.kbk...',
    '..kkkkkkkkkkkk..',
    '.kSSSSSSSSSSSSk.',
    '.kSkaaaaaaaakSk.',
    '.kSkaccaaccakSk.',
    '.kSSSSSSSSSSSSk.',
    '.kkkkkkkkkkkkkk.',
  ]);
  S.kura = make([
    '.....kkkkkk.....',
    '...kkssssssk....',
    '.kkssssssssskk..',
    'kssssssssssssssk',
    'kkkkkkkkkkkkkkkk',
    '.kwwwwwwwwwwwwk.',
    '.kwwwwkkkkwwwwk.',
    '.kwwwwkbbkwwwwk.',
    '.kwwwwkbbkwwwwk.',
    '.kssssssssssssk.',
    '.kskskskskskssk.',
    '.kkkkkkkkkkkkkk.',
  ]);
  S.cart = make([
    '..........',
    'kkkkkkkkk.',
    'kbobobobk.',
    'kbbbbbbbbk',
    'kkkkkkkkkk',
    '.kBk..kBk.',
    '.kkk..kkk.',
  ]);
  // 井戸の範囲にない長屋(水なし)、品切れの大店
  S.markDry = make(['...k...', '..kak..', '.kacak.', '.kaaak.', 'kaaaaak', '.kaaak.', '..kkk..'], { a: 'a', c: 'c' });
  S.markEmpty = make(['kkkkkkk', 'kbbbbbk', 'kb...bk', 'kb.R.bk', 'kb...bk', 'kbbbbbk', 'kkkkkkk']);
  // 店の中の札の位置(絵の上端から)
  S.markAt = { koyatai: 5, yatai: 5, oodana: 11 };
  // 人手なし:人の形に赤い斜線
  S.markNoStaff = make(['kkkkkkk', 'kkmmkRk', 'kkmmRkk', 'kmmRmkk', 'kkRmkkk', 'kRmkmkk', 'kkkkkkk']);
  // 品物の細部
  S.goods = {
    yakitori: make(['.t..t..t.', 'bb.bb.bb.', 'bb.bb.bb.', '.t..t..t.']),
    wataame: make(['mm.pp.mm.', 'mm.pp.mm.', '.t..t..t.', '.t..t..t.']),
    omen: make(['wr.ww.Rw.', 'kw.kk.wk.', 'ww.ww.ww.', '.r..k..r.']),
    chaya: make(['.........', 'cc.cc.cc.', 'cc.cc.cc.', '.........']),
  };
  S.closed = make([
    '.kkkkkkkkkkkkkk.',
    'kssssssssssssssk',
    'kssssssssssssssk',
    '.kskskskskskskk.',
    '.kshhhhhhhhhhsk.',
    '.kshhhhhhhhhhsk.',
    '.kshhhhhhhhhhsk.',
  ]);

  S.plaza = make([
    'kkkkkkkkkkkkkkkk',
    'kbbbbbbbbbbbbbbk',
    'kkkbkkkkkkkkbkkk',
    '..kbk.kkkk.kbk..',
    '..kbkkRRRRkkbk..',
    '..kbkRrrrrRkbk..',
    '..kbkkkkkkkkbk..',
    '..kbkryyyyrkbk..',
    '..kbkyrrrrykbk..',
    '..kbkryyyyrkbk..',
    '..kbkkkkkkkkbk..',
    '..kbkRrrrrRkbk..',
    '..kbkkrrrrkkbk..',
    '..kbk.kkkk.kbk..',
    '..kbk..kk..kbk..',
    '..kbk..ky..kbk..',
    '..kbk......kbk..',
    '.kkbkk....kkbkk.',
    '.kBBBk....kBBBk.',
    '.kkkkk....kkkkk.',
  ]);
  S.gate = make([
    'kkkkkkkkkkkkkkkk',
    'kbbbbbbbbbbbbbbk',
    'kkkkkkkkkkkkkkkk',
    '..kbk......kbk..',
    'kkkbkkkkkkkkbkkk',
    'kBBBBBBBBBBBBBBk',
    'kkkbkkkkkkkkbkkk',
    '..kbk......kbk..',
    '..kbk......kbk..',
    '..kbk......kbk..',
    '..kbk......kbk..',
    '..kbk......kbk..',
    '..kbk......kbk..',
    '..kbk......kbk..',
    '.kBBBk....kBBBk.',
    '.kkkkk....kkkkk.',
  ]);
  S.joya = make([
    '.......kk.......',
    '......kSSk......',
    '....kkSSSSkk....',
    '...kSSSSSSSSk...',
    '...kkkkkkkkkk...',
    '....kSyyyySk....',
    '....kSykkySk....',
    '....kSyyyySk....',
    '....kkkkkkkk....',
    '...kSSSSSSSSk...',
    '...kkkkkkkkkk...',
    '......kSsk......',
    '......kSsk......',
    '......kSsk......',
    '.....kSSssk.....',
    '....kSSSsssk....',
    '....kkkkkkkk....',
  ]);
  S.nagaya = make([
    '................',
    '..kkkkkkkkkkkk..',
    '.kBBBBBBBBBBBBk.',
    'kBBBBBBBBBBBBBBk',
    'kkkkkkkkkkkkkkkk',
    '.kwwwbwwwwbwwwk.',
    '.kwyybwwwwbyywk.',
    '.kwyybwkkwbyywk.',
    '.kwwwbwkkwbwwwk.',
    '.kbbbbbkkbbbbbk.',
    '.kbbbbbkkbbbbbk.',
    '.kkkkkkkkkkkkkk.',
  ]);
  S.aburaya = make([
    '................',
    '..kkkkkkkkkkkk..',
    '.knnnnnnnnnnnnk.',
    'knnnnnnnnnnnnnnk',
    'kkkkkkkkkkkkkkkk',
    '.kwwwkkkkkkwwwk.',
    '.kwwkoooooowwwk.',
    '.kwwkoBoBBokwwk.',
    '.kwwkoooooowwwk.',
    '.kbbbkkyykbbbbk.',
    '.kbbbbkyykbkkkk.',
    '.kkkkkkkkkkbBbk.',
    '...........kbBk.',
    '...........kkkk.',
  ]);
  S.yashiro = make([
    'kkkkkkkkkkkkkkkk',
    'krrrrrrrrrrrrrrk',
    'kkkkkkkkkkkkkkkk',
    '..krk......krk..',
    'kkkrkkkkkkkkrkkk',
    'krrrrrrrrrrrrrrk',
    'kkkrkkkkkkkkrkkk',
    '..krk..kk..krk..',
    '..krk.kssk.krk..',
    '..krkksssskkrk..',
    '..krkkyyyykkrk..',
    '..krkbbbbbbkrk..',
    '..krkkkkkkkkrk..',
    '..kkk......kkk..',
  ]);

  // 人の客。X:着物、Q:帯
  const PERSON = [
    '..hhhh..',
    '.hhhhhh.',
    '.heeeeh.',
    '..eeee..',
    '..XXXX..',
    '.XXQQXX.',
    '.eXXXXe.',
    '..XXXX..',
    '..XXXX..',
    '..X..X..',
  ];
  const KIMONO = [['a', 'y'], ['r', 'w'], ['G', 'o'], ['p', 'v'], ['n', 'R'], ['o', 'r'], ['c', 'n']];
  S.people = KIMONO.map(([X, Q]) => make(PERSON, { X, Q: Q === 'y' ? 'l' : Q }, true));
  // 子ども(小さい)
  S.kids = KIMONO.slice(0, 4).map(([X]) => make([
    '.hhhh.',
    '.heeh.',
    '.eeee.',
    '.XXXX.',
    'eXXXXe',
    '.XXXX.',
    '.X..X.',
  ], { X }, true));

  // 妖怪。y が闇の中で光る
  S.yokai = {
    hitotsume: make([
      '....VVVV....',
      '..VVVVVVVV..',
      '.VVVVVVVVVV.',
      '.VVVmmmmVVV.',
      'VVVmmyymmVVV',
      'VVVmmyymmVVV',
      'VVVVmmmmVVVV',
      'VVVVVVVVVVVV',
      'VVVVkkkkVVVV',
      'VVVVVPPVVVVV',
      'VV.VVV.VVV.V',
      'V...V...V...',
    ], null, true),
    kitsune: make([
      '.w........w.',
      '.ww......ww.',
      '.wrw....wrw.',
      '.wwwwwwwwww.',
      'wwwwwwwwwwww',
      'wwrywwwwyrww',
      'wwwwwwwwwwww',
      '.wwwwrrwwww.',
      '..wwwwwwww..',
      '..oooooooo..',
      '.oooooooooo.',
      '.ooooooooooo',
      '..oo....oo..',
      '..o......o..',
    ], null, true),
    kasa: make([
      '.....kk.....',
      '....rrrr....',
      '...rrrrrr...',
      '..rrrrrrrr..',
      '.rrrryyrrrr.',
      '.rrrryyrrrr.',
      'rrrrrrrrrrrr',
      '..kkkkkkkk..',
      '.....pp.....',
      '.....bb.....',
      '.....bb.....',
      '.....bb.....',
      '....bbbb....',
      '...b....b...',
    ], null, true),
  };
  S.yokaiKinds = Object.keys(S.yokai);

  S.coin = make(['.oo.', 'oyyo', 'oyyo', '.oo.']);
  S.leaf = make(['..G.', '.GGG', 'GGg.', '.b..']);

  // 第2版の建物
  S.taiko = make([
    '....kkkkkkkk....',
    '...kBBBBBBBBk...',
    '..kBBBBBBBBBBk..',
    '..kkkkkkkkkkkk..',
    '...kb.kkkk.bk...',
    '...kbkrrrrkbk...',
    '...kbkrwwrkbk...',
    '...kbkrrrrkbk...',
    '...kb.kkkk.bk...',
    '...kbkkkkkkbk...',
    '...kbbbbbbbbk...',
    '...kb......bk...',
    '...kb......bk...',
    '...kb......bk...',
    '..kbbk....kbbk..',
    '..kkkk....kkkk..',
  ]);
  S.bansho = make([
    '................',
    '..kkkkkkkkkkkk..',
    '.kssssssssssssk.',
    'kssssssssssssssk',
    'kkkkkkkkkkkkkkkk',
    '.kwwwwbwwbwwwwk.',
    '.kwkkwbwwbwkkwk.',
    '.kwkkwbyybwkkwk.',
    '.kwwwwbyybwwwwk.',
    '.kbbbbbkkbbbbbk.',
    '.kbbbbbkkbbbbbk.',
    '.kkkkkkkkkkkkkk.',
  ]);
  S.chayaB = make([
    '................',
    '.kkkkkkkkkkkkkk.',
    'kGwGwGwGwGwGwGwk',
    'kGwGwGwGwGwGwGwk',
    '.kGkGkGkGkGkGkk.',
    '.kb..........bk.',
    '.kb.cc.yy.cc.bk.',
    '.kb.cc.yy.cc.bk.',
    'kkkkkkkkkkkkkkkk',
    'kbbbbbbbbbbbbbbk',
    'kBBBBBBBBBBBBBBk',
    '.kk..kbbbbk..kk.',
    '.....kkkkkk.....',
  ]);
  S.gate2 = make([
    'kkkkkkkkkkkkkkkk',
    'kbbbbbbbbbbbbbbk',
    'kkkkkkkkkkkkkkkk',
    '..kbk......kbk..',
    'kkkbkkkkkkkkbkkk',
    'kBBBBBBBBBBBBBBk',
    'kkkbkkkkkkkkbkkk',
    '..kbk..kk..kbk..',
    '..kbk.kRRk.kbk..',
    '..kbkkRyyRkkbk..',
    '..kbkRyyyyRkbk..',
    '..kbkkkkkkkkbk..',
    '..kbk.kbbk.kbk..',
    '..kbk.kbbk.kbk..',
    '.kBBBk....kBBBk.',
    '.kkkkk....kkkkk.',
  ]);
  // 屋台の上の札。人だけ、人と妖怪、閉店
  S.markHuman = make(['.kkkkk.', 'kRrrrRk', 'kkkkkkk', 'krwwwrk', 'kkkkkkk', 'kRrrrRk', '.kkkkk.']);
  S.markYokai = make(['.kkkkk.', 'kVVVVVk', 'kVmmmVk', 'kmmkmmk', 'kVmmmVk', 'kVVVVVk', '.kkkkk.']);
  S.markClosed = make(['k.....k', '.k...k.', '..k.k..', '...k...', '..k.k..', '.k...k.', 'k.....k'], { k: 'S' });
  // 鬼火(薄暗い店の目印)
  S.onibi = [
    make(['..m..', '.cmc.', '.ccc.', 'cmcmc', '.ccc.', '..c..']),
    make(['.m...', '.cmc.', 'ccmc.', '.cccc', '.ccc.', '..c..']),
  ];
  // 道の脇の行灯
  S.andon = make(['kk', 'yy', 'kk']);
  S.andonOff = make(['kk', 'hh', 'kk']);
  // 自分で消した提灯(火袋はそのまま)
  S.lanternOff = make([
    '......kk........',
    '.....kkkkk......',
    '....krrrrrk.....',
    '...krRRRRRrk....',
    '...kkkkkkkkk....',
    '...krRRRRRrk....',
    '...kRRRRRRRk....',
    '...kkkkkkkkk....',
    '...krRRRRRrk....',
    '....kRRRRRk.....',
    '.....kkkkk......',
    '......kbk.......',
    '......kbk.......',
    '......kbk.......',
    '.....kbBbk......',
    '....kkkkkkk.....',
  ], { R: 'P', r: 'B' });

  // 絵を画像の URL にする(道具の札で使う)
  S.url = function (sp, scale) {
    const c = cv(sp.w * scale, sp.h * scale), x = c.getContext('2d');
    x.imageSmoothingEnabled = false; x.drawImage(sp.img, 0, 0, c.width, c.height);
    return c.toDataURL();
  };
  S.PAL = PAL;
  root.SPR = S;
})(window);
