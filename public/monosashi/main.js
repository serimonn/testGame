// 入口。URLで画面を選ぶ。
//   (なし)                    はじめの画面
//   ?c=CODE                   視聴者(スマホ)
//   ?host=CODE                配信者の操作画面(鍵はこのブラウザに保存)
//   ?view=broadcast&c=CODE    配信用画面(配信ソフトに入れる)
//   ?practice=1               練習モード
(function (root) {
  const { h, $, createStore } = root.UI;
  const app = $('#app');
  const q = new URLSearchParams(location.search);
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const rand = (n, set) => Array.from(crypto.getRandomValues(new Uint32Array(n)), x => set[x % set.length]).join('');

  root.Snd.init();

  function linkFor(store, opts) {
    const link = root.Net.connect(opts, {
      onMessage: m => store.apply(m),
      onStatus: (s, reason) => {
        store.st.conn = s;
        if (s === 'fail') store.st.phase = 'connecting';
        store.emit({ t: 'conn', s, reason });
      },
    });
    return link;
  }

  // ---- チャンネル(参加コードと鍵)
  function loadChannel() {
    try { return JSON.parse(localStorage.getItem('mono_channel') || 'null'); } catch (e) { return null; }
  }
  function saveChannel(ch) { try { localStorage.setItem('mono_channel', JSON.stringify(ch)); } catch (e) {} }
  function newChannel() {
    const ch = { code: rand(5, ALPHA), key: rand(32, ALPHA + 'abcdefghijkmnpqrstuvwxyz'), fresh: true };
    saveChannel(ch);
    return ch;
  }

  function top() {
    document.body.className = 'page-top';
    const ch = loadChannel();
    const input = h('input', { class: 'code-input', maxlength: 5, placeholder: 'ABCDE', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', inputmode: 'text' });
    const err = h('div', { class: 'pv-err' });
    const join = () => {
      const c = normCode(input.value);
      if (c.length !== 5) { err.textContent = '参加コードは5文字です'; return; }
      location.search = '?c=' + c;
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    app.append(h('div', { class: 'top' },
      h('div', { class: 'top-hero' },
        h('div', { class: 'top-logo' }, h('span', { class: 'logo-mark' }), h('span', null, '配信者の', h('b', null, '物差し'))),
        h('p', { class: 'top-catch' }, '配信者がお題を物差しのどこに置いたか、視聴者が当てる。', h('br'), '誰が一番わかっているか、みんなのシンクロ率は何%か。')),
      h('div', { class: 'top-cards' },
        h('div', { class: 'top-card' },
          h('h2', null, '視聴者として参加'),
          h('p', null, '配信に出ている参加コードを入れてください。QRコードを読んでも入れます。'),
          input, err,
          h('button', { class: 'btn primary big', onclick: join }, '参加する')),
        h('div', { class: 'top-card' },
          h('h2', null, '配信者として始める'),
          h('p', null, 'PCのブラウザで開きます。操作画面と、配信ソフトに入れる「配信用画面」の2つを使います。'),
          h('button', { class: 'btn primary big', onclick: () => { const c = ch || newChannel(); location.search = '?host=' + c.code; } }, ch ? `部屋 ${ch.code} を開く` : '部屋を作る'),
          h('button', { class: 'btn ghost', onclick: () => { location.search = '?practice=1'; } }, 'ひとりで練習(CPUの視聴者)'),
          ch ? h('p', { class: 'pv-fine' }, '参加コードは毎回同じです。常連さんの記録(シンクロ率の推移)が残ります。') : null)),
      h('p', { class: 'top-foot' }, '音声:VOICEVOX:春日部つむぎ')));
  }

  function hostPage(code) {
    document.body.className = 'page-host';
    let ch = loadChannel();
    if (!ch || ch.code !== code) {
      app.append(h('div', { class: 'top' }, h('div', { class: 'top-card' },
        h('h2', null, 'この部屋の鍵がありません'),
        h('p', null, `部屋 ${code} は別のブラウザで作られたようです。部屋を作ったブラウザで開くか、新しい部屋を作ってください。`),
        h('button', { class: 'btn primary', onclick: () => { const c = newChannel(); location.search = '?host=' + c.code; } }, '新しい部屋を作る'))));
      return;
    }
    const store = createStore();
    store.st.code = code;
    const link = linkFor(store, { role: 'h', code, query: { key: ch.key, view: 'control' } });
    store.on(m => {
      if (m.t === 'conn' && m.s === 'denied') {
        // 作ったばかりのコードが他の人と重なったときは、作り直す
        if (ch.fresh) { link.close(); const c = newChannel(); location.search = '?host=' + c.code; }
        else alert('この部屋に入れませんでした(鍵が違います)');
      }
      if (m.t === 'snapshot' && ch.fresh) { ch.fresh = false; saveChannel(ch); }
    });
    root.HostView(app, store, link, {});
  }

  function broadcastPage(code) {
    document.body.className = 'page-broadcast';
    const store = createStore();
    store.st.code = code;
    root.Stage(app, { store, sound: q.get('sound') !== '0' });
    if (q.get('bgm') === '0') root.Snd.bgmOn = false;
    linkFor(store, { role: 'h', code, query: { view: 'broadcast' } });
    // ふつうのブラウザでは、クリックするまで音が出ない
    if (root.Snd.needsUnlock()) {
      const hint = h('div', { class: 'unlock' }, 'クリックすると音が出ます(配信ソフトでは不要)');
      document.body.append(hint);
      addEventListener('pointerdown', () => hint.remove(), { once: true });
    }
  }

  function playerPage(code) {
    document.body.className = 'page-player';
    const store = createStore();
    store.st.code = code;
    const link = linkFor(store, { role: 'p', code, query: { d: q.get('dv') || root.Net.deviceId() } }); // dv は1台で複数人を試すとき用
    store.on(m => {
      if (m.t === 'conn' && m.s === 'fail') {
        app.innerHTML = '';
        app.append(h('div', { class: 'top' }, h('div', { class: 'top-card' }, h('h2', null, 'つながりませんでした'), h('p', null, '参加コードを確かめて、もう一度ためしてください。'), h('button', { class: 'btn primary', onclick: () => { location.search = ''; } }, '戻る'))));
      }
    });
    root.PlayerView(app, store, link, {});
  }

  function practicePage() {
    document.body.className = 'page-host';
    const store = createStore();
    store.st.code = '練習';
    const link = root.Practice(store);
    root.HostView(app, store, link, { practice: true, onQuit: () => { link.stop(); location.search = ''; } });
  }

  if (q.get('practice')) practicePage();
  else if (q.get('view') === 'broadcast' && q.get('c')) broadcastPage(normCode(q.get('c')));
  else if (q.get('host')) hostPage(normCode(q.get('host')));
  else if (q.get('c')) playerPage(normCode(q.get('c')));
  else top();
})(window);
