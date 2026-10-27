// public/gattai-drive/ の3ファイルを1枚のHTMLにまとめる（Claudeのページ用・オフライン版）
//   node tools/build-artifact.mjs → dist/gattai-drive.html
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(root, "public/gattai-drive/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/gattai-drive/style.css"), "utf8");
const js = fs.readFileSync(path.join(root, "public/gattai-drive/game.js"), "utf8");

const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];
const body = html.split("<body>")[1].split("<script")[0];

const out = `<title>合体ドライブ</title>
<meta name="theme-color" content="#ffd23f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${css}
html, body { height: 100%; }
body { background: var(--ink); }
.lobby-inner {
  padding-left: max(24px, env(safe-area-inset-left, 0px));
  padding-right: max(24px, env(safe-area-inset-right, 0px));
}
</style>
${body.trim()}
<script>window.GATTAI_OFFLINE = true;</script>
<script>
${js}
</script>
`;
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/gattai-drive.html"), out);
console.log("wrote dist/gattai-drive.html", out.length, "bytes");
