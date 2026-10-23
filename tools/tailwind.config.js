// 從專案根目錄執行 tools/build-css.sh：掃描 HTML 與 JS（JS 字串裡也有 Tailwind 類別）
module.exports = { content: ['./index.html', './js/*.js'], theme: { extend: {} }, plugins: [] };
