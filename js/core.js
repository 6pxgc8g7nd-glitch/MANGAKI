// 資料與基礎工具：儲存、讀取、進度與更新星期的計算

// 舊名稱（toptoon_*）的儲存資料搬到新名稱（mangaki_*）；新的已存在就不覆蓋，確認寫入後才刪舊的
(function migrateStorageKeys() {
    const pairs = [
        ['toptoon_comics', 'mangaki_comics'],
        ['mangaki_comics_corrupt_backup', 'mangaki_comics_corrupt_backup'],
        ['toptoon_gh_cfg', 'mangaki_gh_cfg'],
        ['toptoon_gh_status', 'mangaki_gh_status']
    ];
    try {
        pairs.forEach(([oldKey, newKey]) => {
            const v = localStorage.getItem(oldKey);
            if (v === null) return;
            if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, v);
            if (localStorage.getItem(newKey) === v || localStorage.getItem(newKey) !== null) localStorage.removeItem(oldKey);
        });
        // GitHub 備份檔名也跟著改
        const raw = localStorage.getItem('mangaki_gh_cfg');
        if (raw) {
            const cfg = JSON.parse(raw);
            if (cfg && cfg.path === 'toptoon_backup.json') {
                cfg.path = 'mangaki_backup.json';
                localStorage.setItem('mangaki_gh_cfg', JSON.stringify(cfg));
            }
        }
    } catch (e) { console.error('MANGAKI 搬移舊資料失敗：', e); }
})();

// 內頁圖片功能已移除：第一次開啟時，清掉手機上以前存的圖片資料與閱讀進度
(function purgeLegacyImages() {
    try {
        if (localStorage.getItem('mangaki_images_purged') === '1') return;
        Object.keys(localStorage)
            .filter(k => k.startsWith('mangaki_rpos_') || k.startsWith('mangaki_rpage_') || k === 'mangaki_reader_mode')
            .forEach(k => localStorage.removeItem(k));
        if (!window.indexedDB) { localStorage.setItem('mangaki_images_purged', '1'); return; }
        const req = indexedDB.deleteDatabase('mangaki-images');
        req.onsuccess = () => { try { localStorage.setItem('mangaki_images_purged', '1'); } catch (e) {} };
        req.onerror = () => {};
        req.onblocked = () => {};   // 有別的分頁佔用時，下次開啟再試
    } catch (e) { console.error('MANGAKI 清除舊圖片失敗：', e); }
})();

// 讀取資料；內容損毀或不是陣列時，先把原始內容另存一份再回到空清單，避免整頁白屏
function loadComics() {
    let raw = null;
    try {
        raw = localStorage.getItem('mangaki_comics');
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            // 內頁圖片功能已移除：丟掉舊的 albums 欄位，以及只有圖片、沒有網址的集數
            return parsed.filter(c => c && typeof c === 'object' && typeof c.id === 'string').map(c => {
                const { albums, ...rest } = c;
                if (Array.isArray(rest.links)) rest.links = rest.links.filter(l => l && l.url).map(l => ({ label: l.label || '', url: l.url }));
                return rest;
            });
        }
        throw new Error('mangaki_comics 不是陣列');
    } catch (error) {
        console.error('MANGAKI 讀取資料失敗：', error);
        try {
            if (raw !== null) localStorage.setItem('mangaki_comics_corrupt_backup', raw);
        } catch (e) {}
        return [];
    }
}
let comics = loadComics();

let activeComicId = null;
let activeGenreFilter = '全部';
// 特殊分類「漫畫」：把匯入過圖片、可以用內建閱讀的漫畫整理在一起（不是使用者自己輸入的分類）
const READER_KEY = '__reader__';
const genreLabel = g => g === READER_KEY ? '漫畫' : g;
let activeStatusFilter = '全部';
let currentPage = 1;
const comicsPerPage = 10;
const genresPerPage = 16;   // 分類頁一頁顯示的標籤數
let catPage = 1;
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url, location.href);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch (e) {
        return '';
    }
}

// 把輸入轉成合法的進度數字：空白、負數、亂填都變成 0（0 代表未填）
function parseProgress(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 99999);
}


// 更新星期（0=週日 … 6=週六；null=未指定）
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function parseUpdateDay(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

// 相容舊版的「更新日期」：由日期推算星期
function getUpdateDay(comic) {
    const day = parseUpdateDay(comic.updateDay);
    if (day !== null) return day;
    if (typeof comic.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(comic.updatedAt)) {
        const t = new Date(comic.updatedAt + 'T00:00:00');
        if (!isNaN(t.getTime())) return t.getDay();
    }
    return null;
}

// 距離最近一次更新幾天（0 = 今天更新）
function daysSinceUpdate(day) {
    return (new Date().getDay() - day + 7) % 7;
}

function parseGenres(genreStr) {
    if (!genreStr || genreStr.trim() === '') return ['未分類'];
    // 逗號（半形、全形、頓號）或任何空白（含全形空格）都可以分隔；重複的分類只算一次
    const list = [...new Set(genreStr.split(/[,，、\s\u3000]+/).map(g => g.trim()).filter(g => g.length > 0))];
    return list.length ? list : ['未分類'];
}
