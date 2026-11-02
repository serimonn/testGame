// QRコード(バイトモード、誤り訂正M、型番1〜10)。参加URLを配信画面に出すためだけの最小実装。
(function (root) {
  const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function gmul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1;
    let rt = 1;
    for (let i = 0; i < deg; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], rt); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      rt = gmul(rt, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) {
      const f = b ^ r.shift(); r.push(0);
      div.forEach((c, i) => { r[i] ^= gmul(c, f); });
    }
    return r;
  }
  function alignPos(ver) {
    if (ver === 1) return [];
    const na = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
    const step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
    const r = [6];
    for (let p = size - 7; r.length < na; p -= step) r.splice(1, 0, p);
    return r;
  }
  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
  ];

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    for (; ver <= 10; ver++) {
      const cap = Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) break;
    }
    if (ver > 10) throw new Error('QR: too long');
    const size = ver * 4 + 17, total = Math.floor(rawModules(ver) / 8), ecLen = ECC_PER_BLOCK[ver], nb = BLOCKS[ver];
    const dataCap = total - ecLen * nb;
    // ビット列
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    put(0, Math.min(4, dataCap * 8 - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xec; bits.length < dataCap * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // ブロック分けと誤り訂正
    const nShort = nb - total % nb, shortLen = Math.floor(total / nb);
    const div = rsDivisor(ecLen), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - ecLen + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const cw = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecLen || j >= nShort) cw.push(b[i]); });

    // 機能パターン
    const mod = [], fn = [];
    for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    }
    const ap = alignPos(ver), last = ap.length - 1;
    ap.forEach((ax, i) => ap.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const drawFormat = (mask) => {
      const d = (0 << 3) | mask; // 誤り訂正M = 0
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
      setF(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3);
        setF(a, c, bit); setF(c, a, bit);
      }
    }
    // データを置く
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
        if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    // マスクを選ぶ(簡易の減点:連続、2×2、明暗の偏り)
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let a = 0; a < size; a++) {
        let rx = 1, ry = 1;
        for (let b = 1; b < size; b++) {
          if (mod[a][b] === mod[a][b - 1]) { rx++; if (rx === 5) p += 3; else if (rx > 5) p++; } else rx = 1;
          if (mod[b][a] === mod[b - 1][a]) { ry++; if (ry === 5) p += 3; else if (ry > 5) p++; } else ry = 1;
        }
      }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x < size - 1 && y < size - 1) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      }
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) {
      apply(m); drawFormat(m);
      const p = penalty();
      if (p < bestP) { bestP = p; best = m; }
      apply(m);
    }
    apply(best); drawFormat(best);
    return { size, mod };
  }

  // canvas に描く。quiet は余白のマス数
  function draw(canvas, text, px, opt) {
    const o = Object.assign({ quiet: 2, dark: '#1d1a2b', light: '#ffffff' }, opt);
    const q = encode(text), n = q.size + o.quiet * 2;
    const cell = Math.max(1, Math.floor(px / n));
    canvas.width = canvas.height = cell * n;
    const g = canvas.getContext('2d');
    g.fillStyle = o.light; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = o.dark;
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.mod[y][x]) g.fillRect((x + o.quiet) * cell, (y + o.quiet) * cell, cell, cell);
    return canvas;
  }

  root.QR = { encode, draw };
})(typeof globalThis !== 'undefined' ? globalThis : window);
