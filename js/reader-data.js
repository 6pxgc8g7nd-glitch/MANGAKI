// 內建閱讀（資料）：IndexedDB、圖片與 zip 匯入、匯出

// ================================
// 內建閱讀：圖片存在瀏覽器的 IndexedDB（只在這支手機）
// ================================
const RD_CFG_KEY = 'mangaki_reader_cfg';
const RD_POS_KEY = 'mangaki_reader_pos';
let rdDbPromise = null;
const rdChapterCount = new Map();   // 漫畫 id → 已匯入的話數（讓點卡片可以同步判斷）

// 有圖片的漫畫變動時，同步更新「漫畫」分類的數量與清單
function rdFlagsChanged() {
    try {
        renderCategories();
        if (activeGenreFilter.includes(READER_KEY)) renderComics();
    } catch (e) {}
}

async function rdRefreshFlags() {
    rdUpdateBackupInfo();   // （放在最前面：不管讀取是否成功都更新設定頁的備份說明）
    try {
        const all = await rdRun('chapters', 'readonly', tx => tx.objectStore('chapters').getAll());
        rdChapterCount.clear();
        (all || []).forEach(ch => rdChapterCount.set(ch.comicId, (rdChapterCount.get(ch.comicId) || 0) + 1));
    } catch (e) {}
    rdFlagsChanged();
}
let rdComicId = null;
let rdChapterList = [];
let rd = null; // { chapter, n, urls: Map(頁 → 網址), idx }
let rdCfg = { mode: 'scroll' };
try { Object.assign(rdCfg, JSON.parse(localStorage.getItem(RD_CFG_KEY)) || {}); } catch (e) {}

function rdDb() {
    if (!rdDbPromise) {
        rdDbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject(new Error('這個瀏覽器不支援本機圖片儲存')); return; }
            const req = indexedDB.open('mangaki_reader', 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                db.createObjectStore('chapters', { keyPath: 'id' }).createIndex('comicId', 'comicId');
                db.createObjectStore('pages', { keyPath: 'k' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => { rdDbPromise = null; reject(req.error || new Error('無法開啟本機儲存')); };
        });
    }
    return rdDbPromise;
}

function rdRun(stores, mode, fn) {
    return rdDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        const out = fn(tx);
        tx.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('本機儲存失敗'));
    }));
}

const rdPageKey = (chapterId, i) => `${chapterId}#${String(i).padStart(4, '0')}`;
const rdLoadPos = () => { try { return JSON.parse(localStorage.getItem(RD_POS_KEY)) || {}; } catch (e) { return {}; } };
function rdSavePos(chapterId, idx) {
    try { const m = rdLoadPos(); m[chapterId] = idx; localStorage.setItem(RD_POS_KEY, JSON.stringify(m)); } catch (e) {}
}

async function rdGetChapters(comicId) {
    const list = await rdRun('chapters', 'readonly', tx => tx.objectStore('chapters').index('comicId').getAll(comicId));
    return (list || []).sort((a, b) => a.addedAt - b.addedAt);
}

async function openReaderList() {
    rdComicId = activeComicId;
    const comic = comics.find(c => c.id === rdComicId);
    if (!comic) return;
    document.getElementById('rdListTitle').textContent = comic.title;
    document.getElementById('readerListModal').classList.remove('hidden');
    await rdRenderList();
}

function closeReaderList() {
    document.getElementById('readerListModal').classList.add('hidden');
}

async function rdOpenFirst(comicId) {
    try {
        rdComicId = comicId;
        rdChapterList = await rdGetChapters(comicId);
        if (!rdChapterList.length) { rdChapterCount.delete(comicId); openComicLink(comicId); return; }
        await rdOpen(0);
    } catch (e) { showMsg('無法開啟', e.message || '讀取本機圖片失敗'); }
}

// 點卡片、有多話時的選單（樣式與多集連結的選單相同）；新增與刪除只在編輯畫面操作
async function openChapterSheet(comicId) {
    try {
        rdComicId = comicId;
        rdChapterList = await rdGetChapters(comicId);
    } catch (e) { showMsg('無法開啟', e.message || '讀取本機圖片失敗'); return; }
    if (!rdChapterList.length) { rdChapterCount.delete(comicId); openComicLink(comicId); return; }
    if (rdChapterList.length === 1) { rdOpen(0); return; }
    const sheet = document.getElementById('optionSheet');
    const list = document.getElementById('optionSheetList');
    document.getElementById('optionSheetTitle').innerText = `選擇要開啟的集數（共 ${rdChapterList.length} 集）`;
    list.className = 'grid grid-cols-3 gap-2';
    list.innerHTML = '';
    const close = () => { sheet.classList.add('hidden'); sheet.onclick = null; document.getElementById('optionSheetCancel').onclick = null; };
    rdChapterList.forEach((ch, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-item link-pick';
        const name = document.createElement('span');
        name.className = 'lp-name';
        name.textContent = ch.label || String(i + 1);
        btn.appendChild(name);
        btn.onclick = () => { close(); rdOpen(i); };
        list.appendChild(btn);
    });
    document.getElementById('optionSheetCancel').onclick = close;
    sheet.onclick = e => { if (e.target === sheet) close(); };
    sheet.classList.remove('hidden');
}

async function rdRenderList() {
    const box = document.getElementById('rdChapters');
    try {
        rdChapterList = await rdGetChapters(rdComicId);
        if (rdChapterList.length) rdChapterCount.set(rdComicId, rdChapterList.length); else rdChapterCount.delete(rdComicId);
    } catch (e) {
        box.textContent = e.message;
        return;
    }
    rdFlagsChanged();
    document.getElementById('rdLabel').value = '';
    document.getElementById('rdLabel').placeholder = `名稱，例如：第 ${rdChapterList.length + 1} 話`;
    box.textContent = '';
    if (!rdChapterList.length) {
        const p = document.createElement('p');
        p.className = 'text-[11px] text-neutral-500';
        p.textContent = '還沒有匯入任何一話。';
        box.appendChild(p);
        return;
    }
    const pos = rdLoadPos();
    rdChapterList.forEach((ch, i) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        const open = document.createElement('button');
        open.className = 'flex-1 text-left bg-[#fafafa] border border-[#a6051a]/40 rounded-xl px-3 py-2 text-xs font-bold text-neutral-900 active:scale-[0.98]';
        const done = pos[ch.id] !== undefined ? `　讀到 ${pos[ch.id] + 1}/${ch.count}` : `　${ch.count} 頁`;
        open.textContent = ch.label + done;
        open.onclick = () => rdOpen(i);
        const del = document.createElement('button');
        del.className = 'p-2 text-[#a6051a]';
        del.innerHTML = '<i class="fa-solid fa-trash-can text-xs"></i>';
        del.onclick = () => rdDeleteChapter(ch);
        row.append(open, del);
        box.appendChild(row);
    });
}

// 存一話：getPage(i) 回傳 { buf, type }；一頁一頁寫入，不會一次佔滿記憶體
async function rdSaveChapter(label, count, getPage, order, onProgress, backedUp) {
    const id = `${rdComicId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    try {
        for (let i = 0; i < count; i++) {
            if (onProgress) onProgress(i + 1, count);
            const { buf, type } = await getPage(i);
            await rdRun('pages', 'readwrite', tx => tx.objectStore('pages').put({ k: rdPageKey(id, i), buf, type }));
        }
        await rdRun('chapters', 'readwrite', tx => tx.objectStore('chapters').put({ id, comicId: rdComicId, label, count, addedAt: Date.now() + (order || 0), ...(backedUp ? { backedUp: Date.now() } : {}) }));
    } catch (e) {
        rdRun('pages', 'readwrite', tx => tx.objectStore('pages').delete(IDBKeyRange.bound(`${id}#`, `${id}#￿`))).catch(() => {});
        throw e;
    }
}

function rdImportError(e) {
    const full = e && e.name === 'QuotaExceededError';
    showMsg('匯入失敗', full ? '手機儲存空間不足，請減少圖片或刪除舊的章節。' : (e.message || '無法寫入本機儲存'));
}

async function rdImport(input) {
    const files = Array.from(input.files || []).filter(f => (f.type || '').startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name));
    input.value = '';
    if (!files.length) return;
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const label = document.getElementById('rdLabel').value.trim() || `第 ${rdChapterList.length + 1} 話`;
    const text = document.getElementById('rdImportText');
    text.textContent = `匯入中（${files.length} 張）…`;
    try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        // 存成原始資料而不是檔案物件：iOS 常常讀不回存在 IndexedDB 的檔案物件
        await rdSaveChapter(label, files.length, async i => ({ buf: await files[i].arrayBuffer(), type: files[i].type || 'image/jpeg' }),
            0, (n, total) => { text.textContent = `匯入中（${n}/${total}）…`; });
        await rdRenderList();
    } catch (e) {
        rdImportError(e);
    } finally {
        text.textContent = '選擇圖片並匯入';
    }
}

// ---------- zip 匯入（自己解 zip，不需要額外套件） ----------
const RD_IMG_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp' };
const RD_ZIP_MAX_ENTRY = 150 * 1024 * 1024;   // 單張圖解壓後上限，避免惡意壓縮檔

// 讀 zip 的目錄（只讀檔案尾端的目錄表，不把整個 zip 讀進記憶體）
async function zipList(file) {
    const size = file.size;
    const tailLen = Math.min(size, 65557);
    const tail = new DataView(await file.slice(size - tailLen).arrayBuffer());
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
        if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('這不是有效的 zip 檔');
    const count = tail.getUint16(eocd + 10, true);
    const cdSize = tail.getUint32(eocd + 12, true);
    const cdOff = tail.getUint32(eocd + 16, true);
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new Error('這個 zip 太大（超過 4GB），請分成幾個小一點的 zip。');
    if (cdOff + cdSize > size) throw new Error('zip 檔案損毀');
    const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
    const dec = new TextDecoder('utf-8');
    const entries = [];
    let p = 0;
    for (let k = 0; k < count; k++) {
        if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== 0x02014b50) break;
        const flags = cd.getUint16(p + 8, true);
        const nlen = cd.getUint16(p + 28, true), elen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true);
        entries.push({
            name: dec.decode(new Uint8Array(cd.buffer, p + 46, nlen)),
            method: cd.getUint16(p + 10, true),
            csize: cd.getUint32(p + 20, true),
            usize: cd.getUint32(p + 24, true),
            lho: cd.getUint32(p + 42, true),
            encrypted: !!(flags & 1)
        });
        p += 46 + nlen + elen + clen;
    }
    return entries;
}

async function zipData(file, e) {
    if (e.encrypted) throw new Error('這個 zip 有設密碼，請先解除密碼。');
    if (e.usize > RD_ZIP_MAX_ENTRY) throw new Error('zip 裡有單張過大的檔案');
    const lh = new DataView(await file.slice(e.lho, e.lho + 30).arrayBuffer());
    if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('zip 檔案損毀');
    const start = e.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const raw = file.slice(start, start + e.csize);
    if (e.method === 0) return raw.arrayBuffer();
    if (e.method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('這個瀏覽器版本太舊，無法解壓 zip，請更新 iOS。');
        return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    }
    throw new Error('不支援這個 zip 的壓縮方式');
}

// 挑出 zip 裡的圖片（略過資料夾、macOS 垃圾檔、非圖片）
function zipImageEntries(entries) {
    const out = [];
    entries.forEach(e => {
        const parts = e.name.split('/').filter(Boolean);
        const base = parts[parts.length - 1] || '';
        if (e.name.endsWith('/') || parts.includes('__MACOSX') || base.startsWith('.')) return;
        const ext = (base.split('.').pop() || '').toLowerCase();
        if (!RD_IMG_TYPES[ext]) return;
        out.push({ e, ext, dirs: parts.slice(0, -1), name: parts.join('/') });
    });
    return out;
}

const zipNat = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// 批次：漫畫名稱 / 話 / 圖片。最外面多包的資料夾（例如「漫畫庫」）會自動去掉
function zipBatchPlan(entries, file) {
    const imgs = zipImageEntries(entries);
    imgs.forEach(it => { it.file = file; });
    while (imgs.length && imgs.every(it => it.dirs.length >= 3) && imgs.every(it => it.dirs[0] === imgs[0].dirs[0])) {
        imgs.forEach(it => it.dirs.shift());
    }
    const comicsMap = new Map();
    imgs.forEach(it => {
        if (!it.dirs.length) return;   // 沒在任何資料夾裡的圖片無法判斷是哪部，略過
        const title = it.dirs[0];
        const chDir = it.dirs.slice(1).join('/');
        if (!comicsMap.has(title)) comicsMap.set(title, new Map());
        const chs = comicsMap.get(title);
        if (!chs.has(chDir)) chs.set(chDir, []);
        chs.get(chDir).push(it);
    });
    return Array.from(comicsMap.entries()).sort((a, b) => zipNat(a[0], b[0])).map(([title, chs]) => ({
        title,
        chapters: Array.from(chs.entries()).sort((a, b) => zipNat(a[0], b[0])).map(([dir, items]) => ({
            dir,
            label: dir.split('/').pop() || '',
            items: items.sort((a, b) => zipNat(a.name, b.name))
        }))
    }));
}

// 多個 zip（分卷匯出）合併成一份：同一部、同一話的圖片會接在一起
function zipMergePlans(plans) {
    const merged = new Map();
    plans.flat().forEach(c => {
        if (!merged.has(c.title)) merged.set(c.title, new Map());
        const chs = merged.get(c.title);
        c.chapters.forEach(ch => {
            if (!chs.has(ch.dir)) chs.set(ch.dir, { dir: ch.dir, label: ch.label, items: [] });
            chs.get(ch.dir).items.push(...ch.items);
        });
    });
    return Array.from(merged.entries()).sort((a, b) => zipNat(a[0], b[0])).map(([title, chs]) => ({
        title,
        chapters: Array.from(chs.values()).sort((a, b) => zipNat(a.dir, b.dir)).map(ch => ({ ...ch, items: ch.items.sort((a, b) => zipNat(a.name, b.name)) }))
    }));
}

const normTitle = t => String(t).normalize('NFKC').toLowerCase().replace(/\s+/g, '');

async function rdImportBatch(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    const text = document.getElementById('rdBatchText');
    const idle = '匯入 zip';
    const prevComicId = rdComicId;
    try {
        text.textContent = '讀取 zip…';
        const plans = [];
        for (const f of files) plans.push(zipBatchPlan(await zipList(f), f));
        const plan = zipMergePlans(plans);
        if (!plan.length) { showMsg('找不到圖片', '這個 zip 裡沒有放在「漫畫名稱」資料夾裡的圖片。\n\n正確結構：漫畫名稱 / 第幾話 / 圖片。'); return; }
        const byTitle = new Map(comics.map(c => [normTitle(c.title), c]));
        plan.forEach(c => { c.comic = byTitle.get(normTitle(c.title)) || null; });
        // 你刪除過的漫畫：備份檔裡還有也直接略過，不再問
        const ignored = plan.filter(c => !c.comic && isTitleDeleted(c.title));
        const active = plan.filter(c => !ignored.includes(c));
        if (!active.length) {
            showMsg('沒有要匯入的漫畫', `這個備份裡的 ${ignored.length} 部漫畫都是你刪除過或略過的，所以略過了：${ignored.slice(0, 5).map(c => c.title).join('、')}${ignored.length > 5 ? '…' : ''}\n\n如果想把它們找回來，到設定頁的圖片備份按「清除已刪除記錄」再匯入。`);
            return;
        }
        const matched = active.filter(c => c.comic), missing = active.filter(c => !c.comic);
        const chapterCount = active.reduce((n, c) => n + c.chapters.length, 0);
        const pageCount = active.reduce((n, c) => n + c.chapters.reduce((m, ch) => m + ch.items.length, 0), 0);
        let summary = `找到 ${active.length} 部漫畫、${chapterCount} 話、共 ${pageCount} 頁。\n已配對 ${matched.length} 部`;
        if (missing.length) summary += `，找不到 ${missing.length} 部：${missing.slice(0, 5).map(c => c.title).join('、')}${missing.length > 5 ? '…' : ''}`;
        if (ignored.length) summary += `\n（另有 ${ignored.length} 部是你刪除過或略過的漫畫，已自動略過）`;
        if (!(await showConfirm('批次匯入', summary + '。\n\n要繼續嗎？', { okText: '繼續' }))) return;

        let create = false;
        if (missing.length) {
            create = await showConfirm('找不到的漫畫', `要把這 ${missing.length} 部建立成新漫畫嗎？\n\n選「略過」會只匯入已配對的，而且之後匯入備份時不會再問這幾部。`, { okText: '建立新漫畫', cancelText: '略過' });
            // 選了略過就記住這些名稱，之後匯入不再詢問（設定頁可以清除記錄）
            if (!create) missing.forEach(c => markTitleDeleted(c.title));
        }
        const targets = active.filter(c => c.comic || create);
        if (!targets.length) return;
        if (create) {
            missing.forEach((c, i) => {
                c.comic = { id: String(Date.now() + i), title: c.title, genre: '未分類', status: '連載中', links: [], url: '', coverUrl: '', progress: 0 };
                comics.unshift(c.comic);
            });
            saveComics();
            renderComics();
        }
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

        let done = 0, skipped = 0, pagesDone = 0;
        for (let ci = 0; ci < targets.length; ci++) {
            const c = targets[ci];
            rdComicId = c.comic.id;
            const existing = (await rdGetChapters(rdComicId)).map(ch => ch.label);
            const labels = new Set(existing);
            for (let k = 0; k < c.chapters.length; k++) {
                const ch = c.chapters[k];
                const label = ch.label || (c.chapters.length === 1 ? '第 1 話' : `第 ${existing.length + k + 1} 話`);
                if (labels.has(label)) { skipped++; continue; }
                labels.add(label);
                await rdSaveChapter(label, ch.items.length, async i => ({
                    buf: await zipData(ch.items[i].file, ch.items[i].e),
                    type: RD_IMG_TYPES[ch.items[i].ext]
                }), k, (n, total) => { text.textContent = `匯入中 ${ci + 1}/${targets.length} 部（${n}/${total}）…`; }, true);
                done++; pagesDone += ch.items.length;
            }
        }
        await rdRefreshFlags();
        showMsg('匯入完成', `已匯入 ${done} 話、${pagesDone} 頁。` + (skipped ? `\n略過 ${skipped} 話（已有同名章節）。` : ''));
    } catch (e) {
        rdImportError(e);
        await rdRefreshFlags();
    } finally {
        rdComicId = prevComicId;
        text.textContent = idle;
    }
}


// ---------- 匯出全部漫畫圖片為一個 zip（結構：漫畫名稱 / 話 / 頁碼.副檔名，可直接用「匯入 zip」還原） ----------
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

const safeName = t => String(t).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').trim() || '未命名';
const EXT_OF_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp' };

// 存檔：優先用系統分享表單（可存到「檔案」）；iOS 對可分享的類型有限制，所以依序試不同類型
let rdFallbackWarned = false;
async function rdSaveFile(blob, name, title) {
    let lastErr = '';
    for (const type of ['application/zip', 'application/octet-stream']) {
        const f = new File([blob], name, { type });
        if (!navigator.canShare) { lastErr = '這個瀏覽器不支援分享檔案'; break; }
        if (!navigator.canShare({ files: [f] })) { lastErr = `系統不接受 ${type}`; continue; }
        try { await navigator.share({ files: [f] }); return true; }
        catch (e) {
            if (e && e.name === 'AbortError') return false;   // 使用者自己取消
            lastErr = `${e && e.name}: ${e && e.message}`;
        }
    }
    // 分享不了才退回下載（一般瀏覽器可用；iOS 主畫面 App 可能沒反應）
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (!rdFallbackWarned) showMsg('無法開啟分享表單', `已改用下載，如果沒有收到檔案，請改用 Safari 瀏覽器（不要從主畫面 App）開啟網頁再匯出。\n\n原因：${lastErr}`);
    rdFallbackWarned = true;
    return true;
}

// 一個 zip 的大小上限（預設 1GB）。打包時整個檔案都在記憶體裡，尖峰約是檔案大小的兩倍，
// iPhone 撐不住就會把網頁關掉。所以：打包期間會留一個記號，下次開啟時如果記號還在
// （代表上次打包到一半當掉了），就自動把單檔上限減半，最小 100MB。
const RD_PART_KEY = 'mangaki_export_part_mb';
const RD_INFLIGHT_KEY = 'mangaki_export_inflight';
const RD_PART_DEFAULT_MB = 1024;
const RD_PART_MIN_MB = 100;

function rdPartMB() {
    try {
        const raw = localStorage.getItem(RD_PART_KEY);
        const v = raw === null || raw === '' ? NaN : Number(raw);   // 沒設定過就用預設，不要讓 Number(null)=0 混進來
        if (v >= RD_PART_MIN_MB && v <= RD_PART_DEFAULT_MB) return v;
    } catch (e) {}
    return RD_PART_DEFAULT_MB;
}

function rdCheckCrashedExport() {
    try {
        if (localStorage.getItem(RD_INFLIGHT_KEY) !== '1') return;
        localStorage.removeItem(RD_INFLIGHT_KEY);
        const before = rdPartMB(), after = Math.max(RD_PART_MIN_MB, Math.floor(before / 2));
        localStorage.setItem(RD_PART_KEY, String(after));
        const fmt = mb => mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)}GB` : `${mb}MB`;
        showMsg('上次圖片備份中斷了', before === after
            ? `上次打包到一半網頁被關掉，可能是手機記憶體不夠。目前單個檔案已經是最小的 ${fmt(after)}，請關掉其他 App 後再試一次。`
            : `上次打包到一半網頁被關掉，可能是手機記憶體不夠。已自動把每個備份檔縮小到 ${fmt(after)}（原本 ${fmt(before)}），請再按一次備份。`);
    } catch (e) {}
}
const rdMarkPacking = on => { try { on ? localStorage.setItem(RD_INFLIGHT_KEY, '1') : localStorage.removeItem(RD_INFLIGHT_KEY); } catch (e) {} };

// 標記這些章節「已備份」（章節存進去之後內容不會再變，所以用整話為單位就夠了）
async function rdMarkBackedUp(ids) {
    if (!ids.length) return;
    await rdRun('chapters', 'readwrite', tx => {
        const store = tx.objectStore('chapters');
        ids.forEach(id => {
            const req = store.get(id);
            req.onsuccess = () => { if (req.result) store.put({ ...req.result, backedUp: Date.now() }); };
        });
    });
}

// 設定頁的小字：目前有幾話圖片、還有幾話沒備份過
// 設定頁小字：記住了幾部「刪除過」的漫畫，並提供清除
function rdUpdateDeletedInfo() {
    const el = document.getElementById('rdDeletedInfo');
    if (!el) return;
    const n = deletedTitles().length;
    el.classList.toggle('hidden', n === 0);
    el.querySelector('span').textContent = `已記住 ${n} 部刪除或略過的漫畫（匯入時不再詢問）`;
}

function rdClearDeleted() {
    showConfirm('清除已刪除記錄', '清除後，匯入備份時又會再問你要不要建立這些刪除過或略過的漫畫。\n\n要清除嗎？', { okText: '清除' }).then(ok => {
        if (!ok) return;
        saveDeletedTitles([]);
        rdUpdateDeletedInfo();
    });
}

async function rdUpdateBackupInfo() {
    const el = document.getElementById('rdBackupInfo');
    if (!el) return;
    try {
        const all = await rdRun('chapters', 'readonly', tx => tx.objectStore('chapters').getAll()) || [];
        if (!all.length) { el.textContent = '還沒有匯入任何圖片。'; return; }
        const pending = all.filter(ch => !ch.backedUp);
        const pages = list => list.reduce((n, ch) => n + (ch.count || 0), 0);
        el.textContent = `共 ${all.length} 話、${pages(all)} 頁；` + (pending.length ? `還沒備份過：${pending.length} 話、${pages(pending)} 頁。` : '全部都已備份過。');
    } catch (e) { el.textContent = ''; }
}

let rdExporting = false;

// mode：'new' 只備份還沒備份過的（匯出成功後才會標記）；'all' 完整備份，全部重新匯出
async function rdExportAll(mode = 'all') {
    if (rdExporting) return;
    const onlyNew = mode === 'new';
    const text = document.getElementById(onlyNew ? 'rdExportNewText' : 'rdExportAllText');
    const idle = onlyNew ? '備份新增' : '完整備份（全部圖片）';
    rdFallbackWarned = false;
    rdExporting = true;
    const partBytes = rdPartMB() * 1024 * 1024;
    try {
        // 只匯出清單裡還存在、而且有圖片的漫畫；「新增」模式再濾掉備份過的章節
        const jobs = [];
        for (const comic of comics) {
            if (!rdChapterCount.has(comic.id)) continue;
            let chapters = await rdGetChapters(comic.id);
            if (onlyNew) chapters = chapters.filter(ch => !ch.backedUp);
            if (chapters.length) jobs.push({ comic, chapters });
        }
        if (!jobs.length) {
            showMsg(onlyNew ? '沒有新的圖片' : '沒有圖片', onlyNew
                ? '所有圖片都已經備份過了。\\n\\n如果想重新備份全部，請按「完整備份」。'
                : '還沒有任何漫畫匯入過圖片。');
            return;
        }
        const total = jobs.reduce((n, j) => n + j.chapters.reduce((m, c) => m + c.count, 0), 0);
        const chapterTotal = jobs.reduce((n, j) => n + j.chapters.length, 0);
        if (total > 65000) throw new Error('頁數太多（超過 65000 頁），請先刪掉一部分。');

        // 依序走過每一頁（不一次全讀進記憶體）
        const pages = (function* () {
            const usedTop = new Set();
            for (const { comic, chapters } of jobs) {
                let top = safeName(comic.title), t = 2;
                while (usedTop.has(top)) top = `${safeName(comic.title)} (${t++})`;
                usedTop.add(top);
                const usedFolder = new Set();
                for (const ch of chapters) {
                    let folder = safeName(ch.label), n = 2;
                    while (usedFolder.has(folder)) folder = `${safeName(ch.label)} (${n++})`;
                    usedFolder.add(folder);
                    for (let i = 0; i < ch.count; i++) yield { top, folder, id: ch.id, i, last: i === ch.count - 1 };
                }
            }
        })();

        const enc = new TextEncoder();
        const dosNow = new Date();
        const dosTime = (dosNow.getHours() << 11) | (dosNow.getMinutes() << 5) | (dosNow.getSeconds() >> 1);
        const dosDate = ((dosNow.getFullYear() - 1980) << 9) | ((dosNow.getMonth() + 1) << 5) | dosNow.getDate();
        // 檔名帶日期，每次備份的檔案不會互相覆蓋
        // 檔名帶「日期＋時間（到秒）」：同一天備份很多次，檔名也不會重複，存到「檔案」時不會被問要不要取代舊的。
        // 同一次備份的所有分卷共用同一個時間，後面再加 _01、_02，排序就是正確的。
        const p2 = n => String(n).padStart(2, '0');
        const stamp = `${dosNow.getFullYear()}${p2(dosNow.getMonth() + 1)}${p2(dosNow.getDate())}_${p2(dosNow.getHours())}${p2(dosNow.getMinutes())}${p2(dosNow.getSeconds())}`;
        const baseName = `MANGAKI_圖片_${onlyNew ? '新增' : '全部'}_${stamp}`;
        let next = pages.next(), done = 0, partNo = 0, savedPages = 0, savedChapters = 0;

        while (!next.done) {
            partNo++;
            let parts = [], central = [], offset = 0, bytes = 0;
            const finished = new Set();   // 這個檔案裡已經完整收進去的章節
            rdMarkPacking(true);          // 打包期間記憶體最吃緊；如果這時網頁被關掉，記號會留著
            while (!next.done && bytes < partBytes) {
                const pg = next.value;
                text.textContent = `打包中（${++done}/${total}）…`;
                const rec = await rdRun('pages', 'readonly', tx => tx.objectStore('pages').get(rdPageKey(pg.id, pg.i)));
                next = pages.next();
                if (pg.last) finished.add(pg.id);
                if (!rec) continue;
                const data = new Uint8Array(rec.buf || await rec.blob.arrayBuffer());
                const name = enc.encode(`${pg.top}/${pg.folder}/${String(pg.i + 1).padStart(4, '0')}.${EXT_OF_TYPE[rec.type] || 'jpg'}`);
                const head = new DataView(new ArrayBuffer(30));
                const crc = crc32(data);
                head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
                head.setUint16(8, 0, true); head.setUint16(10, dosTime, true); head.setUint16(12, dosDate, true);
                head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true);
                head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
                parts.push(head.buffer, name, data);
                central.push({ name, crc, size: data.length, offset });
                offset += 30 + name.length + data.length;
                bytes += data.length;
            }
            if (!central.length) break;
            const cdStart = offset;
            let cdSize = 0;
            central.forEach(e => {
                const h = new DataView(new ArrayBuffer(46));
                h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, 0x0800, true);
                h.setUint16(10, 0, true); h.setUint16(12, dosTime, true); h.setUint16(14, dosDate, true);
                h.setUint32(16, e.crc, true); h.setUint32(20, e.size, true); h.setUint32(24, e.size, true);
                h.setUint16(28, e.name.length, true); h.setUint32(42, e.offset, true);
                parts.push(h.buffer, e.name);
                cdSize += 46 + e.name.length;
            });
            const end = new DataView(new ArrayBuffer(22));
            end.setUint32(0, 0x06054b50, true);
            end.setUint16(8, central.length, true); end.setUint16(10, central.length, true);
            end.setUint32(12, cdSize, true); end.setUint32(16, cdStart, true);
            parts.push(end.buffer);
            const blob = new Blob(parts, { type: 'application/zip' });
            parts = null;
            rdMarkPacking(false);         // 打包完成，之後只是等你按儲存
            const single = partNo === 1 && next.done;
            const name = single ? `${baseName}.zip` : `${baseName}_${p2(partNo)}.zip`;
            text.textContent = idle;
            // 分享／下載要由「剛按下的按鈕」觸發，iOS 才允許，所以每個檔案都再問一次
            const head1 = single
                ? `${onlyNew ? '新增的' : '全部的'} ${jobs.length} 部漫畫、${chapterTotal} 話、${central.length} 頁，共 ${(bytes / 1048576).toFixed(1)} MB。`
                : `第 ${partNo} 個檔案：${central.length} 頁，${(bytes / 1048576).toFixed(1)} MB。\\n${next.done ? '這是最後一個。' : '後面還有，儲存完會繼續打包下一個。'}`;
            const ok = await showConfirm(single ? '打包完成' : `分卷匯出（${partNo}）`, `${head1}\\n\\n按「儲存」選擇要存到哪裡。\\n檔名：${name}`, { okText: '儲存', cancelText: '停止' });
            if (!ok) return;
            if (!(await rdSaveFile(blob, name, 'MANGAKI 圖片'))) return;
            savedPages += central.length;
            // 這個檔案存好了，裡面收滿的章節才算「已備份」；中途取消的不會被誤標
            await rdMarkBackedUp([...finished]);
            savedChapters += finished.size;
        }
        showMsg('備份完成', `${partNo > 1 ? `共 ${partNo} 個 zip、` : ''}${savedChapters} 話、${savedPages} 頁已備份。` +
            (partNo > 1 ? '\\n\\n匯入時可以一次選全部檔案。' : '') +
            (onlyNew ? '\\n\\n之後再按「備份新增」，只會備份新匯入的。' : ''));
    } catch (e) {
        showMsg('匯出失敗', e && e.name === 'QuotaExceededError' ? '記憶體或空間不足，請減少圖片後再匯出。' : (e.message || '無法打包'));
    } finally {
        rdMarkPacking(false);
        rdExporting = false;
        text.textContent = idle;
        rdUpdateBackupInfo();
    }
}

async function rdDeleteChapter(ch) {
    if (!(await showConfirm('刪除這一話', `確定要刪除「${ch.label}」的圖片嗎？\n\n刪除後無法復原。`, { danger: true, okText: '刪除' }))) return;
    try {
        await rdRun(['chapters', 'pages'], 'readwrite', tx => {
            tx.objectStore('chapters').delete(ch.id);
            tx.objectStore('pages').delete(IDBKeyRange.bound(`${ch.id}#`, `${ch.id}#￿`));
        });
    } catch (e) { showMsg('刪除失敗', e.message); }
    await rdRenderList();
}

// 刪除整部漫畫時，順便清掉它的圖片
async function rdDeleteComic(comicId) {
    rdChapterCount.delete(comicId);
    rdFlagsChanged();
    try {
        const chapters = await rdGetChapters(comicId);
        if (!chapters.length) return;
        await rdRun(['chapters', 'pages'], 'readwrite', tx => {
            chapters.forEach(ch => {
                tx.objectStore('chapters').delete(ch.id);
                tx.objectStore('pages').delete(IDBKeyRange.bound(`${ch.id}#`, `${ch.id}#￿`));
            });
        });
    } catch (e) {}
}
