// お題データ。人によって置く場所が割れるものだけを入れる(「氷(冷たい〜熱い)」のように答えが決まる物は入れない)。
(function (root) {
  const scales = [
    { id: 'temp', left: '冷たい', right: '熱い' },
    { id: 'adult', left: '子どもっぽい', right: '大人っぽい' },
    { id: 'style', left: 'ダサい', right: 'おしゃれ' },
    { id: 'price', left: '庶民的', right: '高級' },
    { id: 'loud', left: '静か', right: 'うるさい' },
    { id: 'city', left: '田舎', right: '都会' },
    { id: 'flashy', left: '地味', right: '派手' },
    { id: 'strict', left: 'ゆるい', right: 'きびしい' },
    { id: 'health', left: '不健康', right: '健康的' },
    { id: 'hard', left: '簡単', right: '難しい' },
    { id: 'scary', left: '怖くない', right: '怖い' },
  ];
  const list = {
    temp: ['コンビニのおでん', '自販機の「あったか〜い」', '部活の顧問の先生', 'ねこの性格', 'ぬるめのお風呂', '焼きたてのたこ焼きの中身'],
    adult: ['オムライス', 'ブラックコーヒー', 'コーヒーカップ(遊園地)', 'カラオケでアニソン', 'リュックサック', 'ガチャガチャ'],
    style: ['ウエストポーチ', 'サングラスを頭にのせる', 'ペアルック', 'ジャージで買い物', 'デニムの上下'],
    price: ['回転寿司', 'ホテルの朝食ビュッフェ', '1000円のランチ', 'デパ地下のお惣菜', 'ちょっといいシャンプー'],
    loud: ['カフェで作業', '焼肉屋', '雨の音', '運動会の前の日の夜', '深夜のコンビニ'],
    city: ['ショッピングモール', '道の駅', '電車が10分おきに来る駅', '地方の県庁所在地', '牛丼屋が1軒ある駅前'],
    flashy: ['赤い車', '結婚式の余興', 'ネイルのワンポイント', 'たこ焼きパーティー', 'アロハシャツ'],
    strict: ['門限22時', '待ち合わせに3分遅刻', '食べ放題90分', '割り勘を1円単位で', '既読のまま返事は翌日'],
    health: ['ラーメンのスープを半分飲む', '夜中のアイス', '野菜ジュース', '朝ごはんを抜く', 'サウナ'],
    hard: ['ゆで卵の殻むき', '縦列駐車', '一人焼肉', '早起き', '箸で豆をつまむ'],
    scary: ['ジェットコースター', '歯医者', '夜の学校', '大きな犬', '高い所の吊り橋'],
  };
  const topics = [];
  let n = 1;
  for (const s of scales) for (const item of list[s.id]) topics.push({ id: 't' + String(n++).padStart(3, '0'), scaleId: s.id, item });
  root.MONO_TOPICS = { scales, topics };
})(typeof globalThis !== 'undefined' ? globalThis : window);
