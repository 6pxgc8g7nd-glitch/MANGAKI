// 隱私遮蔽模式：封面與名稱換成假的漫畫風圖案

// ================================
// 隱私遮蔽模式：封面換成隨機（但固定）的圖案
// ================================
const PRIVACY_KEY = 'mangaki_privacy';
let privacyMode = false;
try { privacyMode = localStorage.getItem(PRIVACY_KEY) === '1'; } catch (e) {}

function starPts(cx, cy, r1, r2, n) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const r = i % 2 === 0 ? r1 : r2;
        const a = -Math.PI / 2 + Math.PI * i / n;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
}

const DECOY_FRAME = '<rect x="5" y="5" width="290" height="390" fill="none" stroke="#111" stroke-width="8"/><rect x="13" y="13" width="274" height="374" fill="none" stroke="#111" stroke-width="1.5"/>';
// ---- 日本漫畫風：墨線、網點（screentone）、集中線、擬聲字、直書漢字 ----
const INK = '#111';
const FONT = "Hiragino Mincho ProN, Hiragino Sans, Yu Mincho, PingFang TC, serif";
const ln = (w = 5, c = INK) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// 網點圖樣：id、間距、圓點半徑、顏色
const tone = (id, gap = 8, r = 1.8, color = INK, op = 1) =>
    `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="${gap / 2}" cy="${gap / 2}" r="${r}" fill="${color}" fill-opacity="${op}"/></pattern>`;

// 集中線：從外圍向中心的細三角
function speedLines(cx, cy, count, r0, r1, w = 7, color = INK) {
    let out = '';
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rnd(i) * 0.08;
        const ww = w * (0.5 + rnd(i + 9));
        const x1 = cx + r1 * Math.cos(a - ww / r1), y1 = cy + r1 * Math.sin(a - ww / r1);
        const x2 = cx + r1 * Math.cos(a + ww / r1), y2 = cy + r1 * Math.sin(a + ww / r1);
        const rr = r0 + rnd(i + 3) * 30;
        out += `<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}" fill="${color}"/>`;
    }
    return out;
}

// 橫向速度線
function hLines(y0, y1, count, x0 = 0, x1 = 300, color = INK) {
    let out = '';
    for (let i = 0; i < count; i++) {
        const y = y0 + (y1 - y0) * rnd(i + 20), len = 60 + rnd(i + 5) * 140, x = x0 + (x1 - x0 - len) * rnd(i + 40);
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${len.toFixed(1)}" height="${(1.5 + rnd(i) * 2.5).toFixed(1)}" fill="${color}"/>`;
    }
    return out;
}

// 擬聲字（白色描邊 + 黑字）
const sfx = (t, x, y, size, rot = -8, fill = INK, edge = '#fff') =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="900" font-style="italic" text-anchor="middle" transform="rotate(${rot} ${x} ${y})" fill="${fill}" stroke="${edge}" stroke-width="${size / 5}" paint-order="stroke" stroke-linejoin="round">${t}</text>`;

// 直書文字（逐字往下排）
const vtext = (chars, x, y, size, fill = INK, strokeC = '#fff') =>
    [...chars].map((c, i) => `<text x="${x}" y="${y + i * size * 1.08}" font-family="${FONT}" font-size="${size}" font-weight="900" text-anchor="middle" fill="${fill}" stroke="${strokeC}" stroke-width="${size / 9}" paint-order="stroke">${c}</text>`).join('');

const sparkle = (cx, cy, r, fill = '#fff') => `<polygon points="${starPts(cx, cy, r, r * 0.22, 4)}" fill="${fill}" ${ln(3)}/>`;

const PAPER = '#fdfbf4';

// 10 款日本漫畫風單行本封面（300×400）
const DECOY_ART = [
    // 0 熱血少年：集中線 + 尖髮少年 + 擬聲字
    () => `<defs>${tone('t', 7, 1.6, INK, .35)}</defs><rect width="300" height="400" fill="${PAPER}"/>
        <rect width="300" height="400" fill="url(#t)"/>${speedLines(150, 215, 70, 70, 330, 9)}
        <polygon points="95,200 85,120 115,150 125,85 150,135 175,80 185,145 215,115 205,200" fill="${INK}" ${ln(4)}/>
        <ellipse cx="150" cy="215" rx="58" ry="64" fill="#fff" ${ln(6)}/>
        <path d="M92 175 Q150 150 208 175 L208 150 Q150 120 92 150Z" fill="${INK}"/>
        <path d="M100 205 L132 215 M200 205 L168 215" ${ln(7)}/><ellipse cx="122" cy="228" rx="8" ry="11" fill="${INK}"/><ellipse cx="178" cy="228" rx="8" ry="11" fill="${INK}"/>
        <path d="M118 262 Q150 292 182 262 Z" fill="${INK}" ${ln(4)}/>
        <rect x="88" y="178" width="124" height="16" fill="#d7192d" ${ln(4)} transform="rotate(-3 150 186)"/>
        <polygon points="205,186 240,170 232,196 252,204 214,210" fill="#d7192d" ${ln(4)}/>
        ${sfx('ドン!!', 92, 72, 58, -9)}${sfx('ゴゴゴ', 215, 372, 40, 6)}`,
    // 1 少女漫畫：大眼睛 + 閃光 + 花
    () => `<defs>${tone('t', 9, 2.2, '#ee6f9f', .55)}</defs><rect width="300" height="400" fill="#fff1f6"/><rect width="300" height="400" fill="url(#t)"/>
        <path d="M40 215 Q150 120 260 215 Q150 330 40 215Z" fill="#fff" ${ln(6)}/>
        <circle cx="150" cy="215" r="72" fill="#5b3a8e" ${ln(5)}/><circle cx="150" cy="215" r="44" fill="#2a1450"/>
        <circle cx="172" cy="192" r="20" fill="#fff"/><circle cx="130" cy="240" r="11" fill="#fff"/><circle cx="178" cy="238" r="6" fill="#fff"/>
        <path d="M40 215 Q150 100 260 215" fill="none" ${ln(10)}/>
        <path d="M255 205 l32 -14 M248 192 l30 -30 M232 176 l20 -36 M45 205 l-28 -10 M55 192 l-24 -26" ${ln(6)}/>
        ${sparkle(60, 95, 26)}${sparkle(245, 85, 20)}${sparkle(235, 335, 22)}${sparkle(70, 330, 16)}
        ${[0,1,2,3,4].map(i => `<ellipse cx="${40 + i * 56}" cy="${365 - (i % 2) * 18}" rx="9" ry="14" fill="#ffb7cf" ${ln(3)} transform="rotate(${30 + i * 25} ${40 + i * 56} 365)"/>`).join('')}
        ${sfx('キラ', 150, 70, 44, 0)}`,
    // 2 時代劇：血月 + 刀光 + 斬
    () => `<defs>${tone('t', 7, 1.7, INK, .4)}</defs><rect width="300" height="400" fill="${PAPER}"/>
        <circle cx="150" cy="150" r="105" fill="#d7192d" ${ln(6)}/><circle cx="150" cy="150" r="105" fill="url(#t)"/>
        <path d="M0 330 L60 280 L110 320 L170 260 L230 310 L300 270 V400 H0Z" fill="${INK}"/>
        <polygon points="30,372 262,44 276,58 52,392" fill="#fff" ${ln(5)}/><polygon points="262,44 292,22 276,58" fill="#fff" ${ln(4)}/>
        <rect x="14" y="360" width="46" height="18" fill="${INK}" transform="rotate(-54 37 369)"/>
        <path d="M70 330 L240 70 M85 345 L250 95" stroke="#fff" stroke-width="3" fill="none" stroke-opacity=".9"/>
        ${vtext('斬', 245, 215, 78)}`,
    // 3 忍者：手裏劍 + 月 + 忍
    () => `<rect width="300" height="400" fill="${INK}"/>${speedLines(150, 200, 60, 90, 330, 7, '#fff')}
        <circle cx="215" cy="95" r="52" fill="#fff"/><circle cx="232" cy="82" r="48" fill="${INK}"/>
        <g transform="rotate(18 150 230)"><polygon points="${starPts(150, 230, 105, 28, 4)}" fill="#e8e8e8" ${ln(6, '#fff')}/><circle cx="150" cy="230" r="22" fill="${INK}" ${ln(5, '#fff')}/></g>
        <g transform="rotate(-25 70 320)"><polygon points="${starPts(70, 320, 42, 12, 4)}" fill="#d7192d" ${ln(4, '#fff')}/></g>
        ${vtext('忍', 48, 70, 60, '#fff', INK)}${sfx('シュッ', 215, 360, 40, -6, '#d7192d')}`,
    // 4 機甲：機器人頭 + 速度線
    () => `<defs>${tone('t', 6, 1.5, INK, .45)}</defs><rect width="300" height="400" fill="#e9ecef"/><rect width="300" height="400" fill="url(#t)"/>${hLines(0, 400, 26, 0, 300)}
        <polygon points="95,150 110,60 130,110 150,40 170,110 190,60 205,150" fill="#d7192d" ${ln(5)}/>
        <rect x="78" y="140" width="144" height="150" rx="14" fill="#fff" ${ln(7)}/>
        <rect x="92" y="175" width="116" height="42" rx="8" fill="${INK}"/><rect x="100" y="184" width="40" height="24" fill="#ffd400"/><rect x="160" y="184" width="40" height="24" fill="#ffd400"/>
        <path d="M105 245 H195 M105 262 H195 M105 279 H195" ${ln(4)}/>
        <rect x="60" y="165" width="22" height="70" rx="6" fill="#d7192d" ${ln(5)}/><rect x="218" y="165" width="22" height="70" rx="6" fill="#d7192d" ${ln(5)}/>
        <rect x="105" y="290" width="90" height="38" fill="#cfd3d7" ${ln(6)}/>
        ${sfx('ガシャン', 150, 372, 46, -5)}${sparkle(235, 100, 22, '#ffd400')}`,
    // 5 學園：校舍時鐘塔 + 櫻花
    () => `<defs>${tone('t', 8, 1.8, '#4a90d9', .5)}</defs><rect width="300" height="400" fill="#dff0ff"/><rect width="300" height="260" fill="url(#t)"/>
        <circle cx="230" cy="80" r="34" fill="#fff" ${ln(4)}/>
        <rect x="40" y="230" width="220" height="120" fill="#fff" ${ln(6)}/><rect x="115" y="130" width="70" height="220" fill="#fff" ${ln(6)}/>
        <polygon points="105,132 150,80 195,132" fill="#d7192d" ${ln(6)}/>
        <circle cx="150" cy="170" r="22" fill="#fff" ${ln(5)}/><path d="M150 170 V156 M150 170 L162 176" ${ln(4)}/>
        ${[0,1,2].map(i => `<rect x="${54 + i * 22}" y="252" width="16" height="22" fill="${INK}"/><rect x="${200 + i * 20}" y="252" width="16" height="22" fill="${INK}"/><rect x="${54 + i * 22}" y="292" width="16" height="22" fill="${INK}"/><rect x="${200 + i * 20}" y="292" width="16" height="22" fill="${INK}"/>`).join('')}
        <rect x="132" y="296" width="36" height="54" fill="${INK}"/><rect x="0" y="350" width="300" height="50" fill="${INK}"/>
        ${[...Array(12)].map((_, i) => `<ellipse cx="${20 + rnd(i) * 260}" cy="${30 + rnd(i + 7) * 300}" rx="6" ry="9" fill="#ffc2d6" ${ln(2.5)} transform="rotate(${rnd(i + 2) * 180} ${20 + rnd(i) * 260} ${30 + rnd(i + 7) * 300})"/>`).join('')}
        ${vtext('春', 35, 60, 46)}`,
    // 6 鬼：鬼面 + 紅底
    () => `<defs>${tone('t', 7, 1.7, INK, .5)}</defs><rect width="300" height="400" fill="#7a0f1c"/><rect width="300" height="400" fill="url(#t)"/>${speedLines(150, 220, 56, 110, 340, 7, '#000')}
        <polygon points="78,150 55,60 118,115" fill="#fff" ${ln(6)}/><polygon points="222,150 245,60 182,115" fill="#fff" ${ln(6)}/>
        <ellipse cx="150" cy="225" rx="95" ry="105" fill="#e2332f" ${ln(8)}/>
        <path d="M85 195 L132 215 M215 195 L168 215" ${ln(11)}/>
        <ellipse cx="116" cy="228" rx="20" ry="13" fill="#fff" ${ln(5)} transform="rotate(12 116 228)"/><ellipse cx="184" cy="228" rx="20" ry="13" fill="#fff" ${ln(5)} transform="rotate(-12 184 228)"/>
        <circle cx="118" cy="230" r="6" fill="${INK}"/><circle cx="182" cy="230" r="6" fill="${INK}"/>
        <path d="M100 285 Q150 262 200 285 Q150 335 100 285Z" fill="${INK}" ${ln(5)}/><polygon points="115,284 125,284 120,302" fill="#fff"/><polygon points="175,284 185,284 180,302" fill="#fff"/>
        ${vtext('鬼', 262, 60, 58, '#fff', INK)}${sfx('ゴゴゴ', 80, 372, 44, -4, '#ffd400', '#000')}`,
    // 7 美食：拉麵
    () => `<defs>${tone('t', 8, 1.8, '#e0a800', .5)}</defs><rect width="300" height="400" fill="#fff2b8"/><rect width="300" height="400" fill="url(#t)"/>
        <path d="M110 150 q-14 -30 8 -52 M150 150 q-14 -30 8 -52 M190 150 q-14 -30 8 -52" fill="none" ${ln(6)}/>
        <path d="M30 185 H270 Q262 330 150 345 Q38 330 30 185Z" fill="#fff" ${ln(7)}/><path d="M34 200 H266" ${ln(5)}/>
        <path d="M50 228 H250 M64 250 H236 M84 272 H216" stroke="#d7192d" stroke-width="7" stroke-linecap="round" fill="none"/>
        <ellipse cx="150" cy="185" rx="120" ry="22" fill="#ffd58a" ${ln(6)}/>
        <path d="M60 185 q15 -14 30 0 t30 0 t30 0 t30 0 t30 0" fill="none" ${ln(4)}/>
        <circle cx="105" cy="182" r="22" fill="#fff" ${ln(5)}/><circle cx="105" cy="182" r="10" fill="#ffb300" ${ln(3)}/>
        <circle cx="195" cy="182" r="20" fill="#ffd6e1" ${ln(5)}/><path d="M195 182 m-12 0 a12 12 0 1 1 12 12" fill="none" ${ln(3)}/>
        <path d="M215 120 L282 40 M235 128 L296 62" ${ln(7)}/><rect x="120" y="350" width="60" height="14" fill="${INK}"/>
        ${sfx('ズルッ', 70, 85, 50, -10)}${sparkle(255, 270, 18)}`,
    // 8 熱血運動：足球 + 動態線
    () => `<defs>${tone('t', 7, 1.6, INK, .35)}</defs><rect width="300" height="400" fill="${PAPER}"/><rect width="300" height="400" fill="url(#t)"/>${hLines(40, 360, 30, 0, 300)}
        <rect x="0" y="330" width="300" height="70" fill="${INK}"/><path d="M0 345 H300 M0 365 H300" stroke="#fff" stroke-width="2" stroke-dasharray="14 10"/>
        <circle cx="170" cy="190" r="86" fill="#fff" ${ln(8)}/>
        <polygon points="${starPts(170, 190, 36, 36, 5)}" fill="${INK}" ${ln(4)}/>
        <path d="M170 154 V104 M200 175 L246 158 M188 218 L222 262 M152 218 L118 262 M140 175 L94 158" ${ln(5)}/>
        <path d="M20 150 L84 150 M10 190 L70 190 M24 230 L84 230" ${ln(8)}/>
        ${sfx('バシッ!', 110, 78, 56, -8, '#d7192d')}${vtext('燃', 40, 285, 40)}`,
    // 9 戀雨：紅傘 + 雨 + 愛心
    () => `<rect width="300" height="400" fill="#b9c9dc"/><defs>${tone('t', 8, 1.7, '#5b7ca3', .55)}</defs><rect width="300" height="400" fill="url(#t)"/>
        ${[...Array(34)].map((_, i) => { const x = rnd(i) * 320 - 10, y = rnd(i + 11) * 400; return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l-10 30" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`; }).join('')}
        <path d="M30 220 Q40 80 150 70 Q260 80 270 220 Q235 195 210 220 Q180 195 150 220 Q120 195 90 220 Q65 195 30 220Z" fill="#d7192d" ${ln(7)}/>
        <path d="M150 70 V215 M150 70 Q100 100 90 215 M150 70 Q200 100 210 215" fill="none" ${ln(4)}/>
        <path d="M150 215 V330 Q150 358 122 352" fill="none" ${ln(9)}/>
        <path d="M222 300 c0 -18 24 -18 24 0 c0 12 -12 22 -12 28 c0 -6 -12 -16 -12 -28Z" fill="#fff" ${ln(4)} transform="translate(-6 -10)"/>
        <path d="M75 290 c0 -14 18 -14 18 0 c0 9 -9 16 -9 21 c0 -5 -9 -12 -9 -21Z" fill="#ffd6e1" ${ln(3.5)}/>
        ${vtext('恋', 38, 60, 54, '#fff', INK)}${sparkle(245, 70, 20)}${sfx('ザー', 215, 385, 36, -4, INK)}`
];

// 封面款式編號（0～9）：封面圖案與假名稱共用，這樣名稱會對得上圖案
function decoyIndex(id) {
    let h = 5381;
    for (const c of String(id)) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
    return (h >>> 0) % DECOY_ART.length;
}

// 每款封面各有一組名稱素材（前綴 × 主體 × 後綴），順序要和 DECOY_ART 一致
const DECOY_NAMES = [
    { p: ['燃燒吧', '最強', '不滅的', '衝刺的', '無敵', '拚命的'], n: ['少年', '拳頭', '熱血魂', '隊長'], s: ['', '傳', '物語'] },        // 0 熱血少年
    { p: ['閃耀的', '心動的', '初戀的', '溫柔的', '夢幻的', '透明的'], n: ['眼瞳', '少女', '花季', '星光'], s: ['', '物語', '日記'] },   // 1 少女漫畫
    { p: ['月下的', '血月之', '孤高的', '浪人', '幕末', '無名的'], n: ['劍客', '武士', '斬', '刀鍛冶'], s: ['', '傳', '帖'] },            // 2 時代劇
    { p: ['影之', '暗夜', '疾風', '無聲的', '月夜', '隱密的'], n: ['忍者', '手裏劍', '忍者村', '暗殺者'], s: ['', '傳', '帖'] },        // 3 忍者
    { p: ['鋼鐵', '超級', '最終', '閃電', '機動', '宇宙'], n: ['機器人', '戰士', '機甲', '巨神'], s: ['', '戰記', '傳說'] },            // 4 機甲
    { p: ['春天的', '放課後的', '櫻花下的', '青春', '午後的', '轉學生的'], n: ['校園', '鐘塔', '學園', '教室'], s: ['', '日記', '物語'] }, // 5 校園
    { p: ['紅色的', '妖怪', '百鬼', '鬼之', '夜行的', '惡鬼'], n: ['惡鬼', '鬼面', '妖怪', '羅剎'], s: ['', '傳說', '錄'] },            // 6 鬼
    { p: ['深夜', '絕品', '老店的', '熱騰騰的', '匠人的', '幸福的'], n: ['拉麵', '食堂', '料理人', '麵館'], s: ['', '日記', '物語'] },   // 7 拉麵
    { p: ['熱血', '最強', '無敵的', '夢想的', '衝刺的', '藍色'], n: ['足球', '射門', '球場', '前鋒'], s: ['', '少年', '物語'] },        // 8 足球
    { p: ['雨中的', '梅雨', '傘下的', '告白的', '紅傘', '心動的'], n: ['戀情', '約定', '二人', '初戀'], s: ['', '物語', '日記'] }      // 9 雨中戀情
];

// 遮蔽模式的假名稱：由漫畫編號固定產生，且主題與該漫畫的假封面一致
function decoyTitle(id, idx = decoyIndex(id)) {
    const set = DECOY_NAMES[idx];
    let h = 7;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
    const a = Math.abs(h);
    const p = set.p.length, n = set.n.length;
    return set.p[a % p] + set.n[Math.floor(a / p) % n] + set.s[Math.floor(a / (p * n)) % set.s.length];
}

function decoyCover(id, idx = decoyIndex(id)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">${DECOY_ART[idx]()}${DECOY_FRAME}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// 同一頁的封面不重複：先用編號算出偏好的款式，被用掉就順延到下一個空位
function assignDecoys(list) {
    const map = new Map();
    let used = new Set();
    list.forEach(c => {
        if (used.size >= DECOY_ART.length) used = new Set();
        let k = decoyIndex(c.id);
        while (used.has(k)) k = (k + 1) % DECOY_ART.length;
        used.add(k);
        map.set(c.id, k);
    });
    return map;
}

function updatePrivacyBtn() {
    const btn = document.getElementById('privacyBtn');
    if (!btn) return;
    btn.classList.toggle('is-on', privacyMode);
    btn.innerHTML = `<i class="fa-solid ${privacyMode ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    btn.setAttribute('aria-pressed', String(privacyMode));
}

function togglePrivacy() {
    privacyMode = !privacyMode;
    try { localStorage.setItem(PRIVACY_KEY, privacyMode ? '1' : '0'); } catch (e) {}
    renderComics();
}
