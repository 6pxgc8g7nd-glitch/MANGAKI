// 內建閱讀（畫面）：閱讀器、縮放、手勢

// ---------- 閱讀畫面 ----------
async function rdOpen(chIdx, startAt) {
    const chapter = rdChapterList[chIdx];
    if (!chapter) return;
    // 只確認第一頁存在；其餘頁面看到才一頁一頁讀，避免大章節一次塞滿記憶體
    let first;
    try {
        first = await rdRun('pages', 'readonly', tx => tx.objectStore('pages').get(rdPageKey(chapter.id, 0)));
    } catch (e) { showMsg('無法開啟', e.message); return; }
    if (!first) { showMsg('無法開啟', '找不到這一話的圖片。'); return; }
    rdRelease();
    const saved = rdLoadPos()[chapter.id];
    const n = chapter.count;
    const idx = Math.min(n - 1, Math.max(0, startAt !== undefined ? startAt : (saved || 0)));
    rd = { chIdx, chapter, n, urls: new Map(), idx, bad: 0 };
    document.getElementById('rdBarTitle').textContent = chapter.label;
    const view = document.getElementById('readerView');
    const fresh = view.classList.contains('hidden');
    view.classList.remove('hidden');
    if (typeof assistRefresh === 'function') assistRefresh();   // 進入閱讀器：隱藏懸浮按鈕
    document.body.style.overflow = 'hidden';
    rdResetZoom();
    if (fresh) {
        // 剛進入閱讀器：先顯示工具列，約 2 秒後自動收起
        rdBars(true);
        rdBarTimer = setTimeout(() => rdBars(false), 2000);
    }
    await rdRender();
}

// 取得某一頁的圖片網址（讀一次就暫存，離開畫面時釋放）
async function rdPageUrl(i) {
    const cur = rd;
    if (!cur || i < 0 || i >= cur.n) return null;
    if (cur.urls.has(i)) return cur.urls.get(i);
    let rec;
    try { rec = await rdRun('pages', 'readonly', tx => tx.objectStore('pages').get(rdPageKey(cur.chapter.id, i))); } catch (e) { return null; }
    if (rd !== cur || !rec) return null;
    if (cur.urls.has(i)) return cur.urls.get(i);
    const url = URL.createObjectURL(rec.buf ? new Blob([rec.buf], { type: rec.type || 'image/jpeg' }) : rec.blob);
    cur.urls.set(i, url);
    return url;
}

function rdFreePage(i) {
    if (!rd || !rd.urls.has(i)) return;
    URL.revokeObjectURL(rd.urls.get(i));
    rd.urls.delete(i);
}

function rdRelease() {
    if (rd) { rd.urls.forEach(u => URL.revokeObjectURL(u)); if (rd.observer) rd.observer.disconnect(); }
    rd = null;
    document.getElementById('rdScroll').textContent = '';
    document.getElementById('rdPageImg').removeAttribute('src');
}

function rdClose() {
    clearTimeout(rdBarTimer);
    if (rd) rdSavePos(rd.chapter.id, rd.idx);
    rdRelease();
    document.getElementById('readerView').classList.add('hidden');
    document.body.style.overflow = '';
    if (typeof assistRefresh === 'function') assistRefresh();
    rdRenderList();
}

// 圖示 = 目前的模式：直式長頁加上下箭頭是捲動，攤開的書是翻頁
const RD_ICON_SCROLL = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M12 7v10"/><path d="M9 9.5L12 7l3 2.5"/><path d="M9 14.5L12 17l3-2.5"/></svg>';
const RD_ICON_PAGED = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.8C9.9 5.2 6.9 4.6 3.5 5.2v12.2c3.4-.6 6.4 0 8.5 1.6 2.1-1.6 5.1-2.2 8.5-1.6V5.2c-3.4-.6-6.4 0-8.5 1.6z"/><path d="M12 6.8V19"/></svg>';
function rdUpdateButtons() {
    const modeBtn = document.getElementById('rdModeBtn');
    modeBtn.innerHTML = rdCfg.mode === 'scroll' ? RD_ICON_SCROLL : RD_ICON_PAGED;
    modeBtn.setAttribute('aria-label', rdCfg.mode === 'scroll' ? '目前是上下捲動，點一下改成左右翻頁' : '目前是左右翻頁，點一下改成上下捲動');
}

function rdSaveCfg() { try { localStorage.setItem(RD_CFG_KEY, JSON.stringify(rdCfg)); } catch (e) {} }
function rdToggleMode() { rdCfg.mode = rdCfg.mode === 'scroll' ? 'paged' : 'scroll'; rdSaveCfg(); rdResetZoom(); rdRender(); }

function rdShowPageNo() {
    if (!rd) return;
    document.getElementById('rdPageNo').textContent = `${rd.idx + 1} / ${rd.n}`;
    const slider = document.getElementById('rdSlider');
    slider.max = String(rd.n);
    slider.value = String(rd.idx + 1);
}

// 進度條：拖曳跳到指定頁
let rdSeekAt = 0;
function rdSeek(i) {
    if (!rd) return;
    rd.idx = Math.min(rd.n - 1, Math.max(0, i));
    rdSeekAt = Date.now();
    document.getElementById('rdPageNo').textContent = `${rd.idx + 1} / ${rd.n}`;
    if (rdCfg.mode === 'scroll') {
        const img = document.getElementById('rdScroll').querySelectorAll('img')[rd.idx];
        if (img) img.scrollIntoView();
        rdSavePos(rd.chapter.id, rd.idx);
    } else {
        rdShowPaged();
    }
}

// ---------- 縮放（雙指）與工具列自動收起 ----------
const rdZ = { scroll: 1, paged: { s: 1, x: 0, y: 0 } };
let rdBarTimer = 0;

function rdBars(show) {
    clearTimeout(rdBarTimer);
    ['rdBar', 'rdFoot'].forEach(id => document.getElementById(id).classList.toggle('hidden', !show));
}

function rdApplyPaged() {
    const z = rdZ.paged;
    document.getElementById('rdPageImg').style.transform = z.s > 1 ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : '';
}

function rdResetZoom() {
    rdZ.scroll = 1;
    rdZ.paged = { s: 1, x: 0, y: 0 };
    const inner = document.getElementById('rdScrollInner');
    if (inner) inner.style.width = '100%';
    rdApplyPaged();
}

const rdZoomGet = () => rdCfg.mode === 'scroll' ? rdZ.scroll : rdZ.paged.s;

// 縮放到 z 倍，並讓手指中心點（fx, fy）底下的內容留在原地
function rdZoomTo(z, fx, fy) {
    z = Math.min(4, Math.max(1, z));
    if (rdCfg.mode === 'scroll') {
        const sc = document.getElementById('rdScroll'), inner = document.getElementById('rdScrollInner');
        if (!inner) return;
        const oldW = inner.offsetWidth, rect = sc.getBoundingClientRect();
        const px = fx - rect.left, py = fy - rect.top, left = sc.scrollLeft, top = sc.scrollTop;
        rdZ.scroll = z < 1.03 ? 1 : z;
        inner.style.width = `${rdZ.scroll * 100}%`;
        const k = inner.offsetWidth / oldW;
        sc.scrollLeft = (left + px) * k - px;
        sc.scrollTop = (top + py) * k - py;
    } else {
        const img = document.getElementById('rdPageImg'), box = document.getElementById('rdPaged');
        const zp = rdZ.paged, rect = box.getBoundingClientRect();
        const cx = rect.left + img.offsetLeft + img.offsetWidth / 2, cy = rect.top + img.offsetTop + img.offsetHeight / 2;
        const px = (fx - cx - zp.x) / zp.s, py = (fy - cy - zp.y) / zp.s;
        zp.s = z < 1.03 ? 1 : z;
        zp.x = fx - cx - px * zp.s;
        zp.y = fy - cy - py * zp.s;
        rdClampPaged();
        rdApplyPaged();
    }
}

// 放大後拖曳時，不要讓圖片離開畫面太遠
function rdClampPaged() {
    const z = rdZ.paged, img = document.getElementById('rdPageImg'), box = document.getElementById('rdPaged');
    if (z.s <= 1) { z.x = 0; z.y = 0; return; }
    const maxX = Math.max(0, (img.offsetWidth * z.s - box.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * z.s - box.clientHeight) / 2);
    z.x = Math.min(maxX, Math.max(-maxX, z.x));
    z.y = Math.min(maxY, Math.max(-maxY, z.y));
}

// 捲動模式：點上／下三分之一，往上／往下捲一屏（約 0.25 秒）
let rdScrollAnim = 0;
function rdScrollScreen(dir) {
    const sc = document.getElementById('rdScroll');
    cancelAnimationFrame(rdScrollAnim);
    const from = sc.scrollTop;
    const max = sc.scrollHeight - sc.clientHeight;
    const to = Math.min(max, Math.max(0, from + dir * sc.clientHeight * 0.9));
    if (Math.abs(to - from) < 2) return;
    const start = performance.now(), dur = 250;
    const step = now => {
        const t = Math.min(1, (now - start) / dur);
        sc.scrollTop = from + (to - from) * (1 - Math.pow(1 - t, 3));
        if (t < 1) rdScrollAnim = requestAnimationFrame(step);
    };
    rdScrollAnim = requestAnimationFrame(step);
}

async function rdRender() {
    if (!rd) return;
    rdUpdateButtons();
    rdShowPageNo();
    const scroll = document.getElementById('rdScroll');
    const paged = document.getElementById('rdPaged');
    if (rdCfg.mode === 'scroll') {
        paged.classList.add('hidden');
        scroll.classList.remove('hidden');
        scroll.textContent = '';
        const cur = rd;
        if (cur.observer) cur.observer.disconnect();
        cur.urls.forEach(u => URL.revokeObjectURL(u));
        cur.urls.clear();
        const imgs = [];
        const inner = document.createElement('div');
        inner.id = 'rdScrollInner';
        inner.style.width = `${rdZ.scroll * 100}%`;
        scroll.appendChild(inner);
        for (let k = 0; k < cur.n; k++) {
            const img = document.createElement('img');
            img.className = 'block w-full';
            img.dataset.i = String(k);
            img.style.minHeight = '40vh';
            img.onload = () => { img.style.minHeight = ''; img.style.height = ''; img.style.aspectRatio = ''; };
            img.onerror = () => { if (img.getAttribute('src')) rdImageFailed(); };
            inner.appendChild(img);
            imgs.push(img);
        }
        const next = document.createElement('button');
        next.className = 'block w-full py-8 text-sm font-bold text-white/80';
        next.textContent = '下一話 ▶';
        next.onclick = () => rdStep(1, true);
        inner.appendChild(next);

        const at = cur.idx;
        // 用目前這一頁的長寬比先把所有頁面的高度預留好，載入後位置才不會亂跳
        const firstUrl = await rdPageUrl(at);
        if (rd !== cur) return;
        if (firstUrl) {
            const probe = new Image();
            await new Promise(r => { probe.onload = probe.onerror = r; probe.src = firstUrl; });
            if (rd !== cur) return;
            if (probe.naturalWidth && probe.naturalHeight) {
                imgs.forEach(im => { im.style.minHeight = ''; im.style.aspectRatio = `${probe.naturalWidth} / ${probe.naturalHeight}`; });
            }
        }
        imgs[at].scrollIntoView();

        // 只載入畫面附近的頁，離開畫面的釋放掉（保留高度避免版面跳動）
        cur.observer = new IntersectionObserver(entries => {
            entries.forEach(async en => {
                const im = en.target, k = Number(im.dataset.i);
                if (en.isIntersecting) {
                    const url = await rdPageUrl(k);
                    if (rd === cur && url && en.target.isConnected && !im.getAttribute('src')) im.src = url;
                } else if (im.getAttribute('src')) {
                    if (im.naturalWidth && im.naturalHeight) im.style.aspectRatio = `${im.naturalWidth} / ${im.naturalHeight}`;
                    else im.style.height = im.clientHeight + 'px';
                    im.removeAttribute('src');
                    rdFreePage(k);
                }
            });
        }, { root: scroll, rootMargin: '150% 0px' });
        imgs.forEach(im => cur.observer.observe(im));
    } else {
        scroll.classList.add('hidden');
        scroll.textContent = '';
        if (rd.observer) rd.observer.disconnect();
        rd.urls.forEach(u => URL.revokeObjectURL(u));
        rd.urls.clear();
        paged.classList.remove('hidden');
        rdShowPaged();
    }
}

function rdImageFailed() {
    if (!rd || rd.bad++ > 0) return;
    showMsg('圖片無法顯示', '這張圖片的格式瀏覽器打不開（例如 HEIC）。請先把圖片轉成 JPG 或 PNG 再匯入。');
}

async function rdShowPaged() {
    const cur = rd;
    const idx = cur.idx;
    rdZ.paged = { s: 1, x: 0, y: 0 };
    rdApplyPaged();
    const pageImg = document.getElementById('rdPageImg');
    pageImg.onerror = () => { if (pageImg.getAttribute('src')) rdImageFailed(); };
    rdShowPageNo();
    rdSavePos(cur.chapter.id, idx);
    const url = await rdPageUrl(idx);
    if (rd !== cur || cur.idx !== idx || !url) return;
    pageImg.src = url;
    // 預載下一頁，並釋放離得遠的頁
    rdPageUrl(idx + 1);
    [...cur.urls.keys()].forEach(k => { if (k < idx - 1 || k > idx + 2) rdFreePage(k); });
}

// 翻頁模式：dir = +1 下一頁、-1 上一頁；到頭尾就換章節
function rdTurn(dir) {
    if (!rd) return;
    const n = rd.idx + dir;
    if (n < 0 || n >= rd.n) { rdStep(dir, false); return; }
    rd.idx = n;
    rdShowPaged();
}

// 換章節；回到上一話時停在它的最後一頁
function rdStep(dir, fromButton) {
    if (!rd) return;
    const target = rd.chIdx + dir;
    if (target < 0 || target >= rdChapterList.length) {
        if (fromButton || dir > 0) showMsg(dir > 0 ? '已是最後一話' : '已是第一話', dir > 0 ? '這部漫畫沒有更後面的章節了。' : '這是最前面的章節。');
        return;
    }
    rdSavePos(rd.chapter.id, rd.idx);
    rdOpen(target, dir < 0 && !fromButton ? rdChapterList[target].count - 1 : 0);
}

// 捲動模式：依畫面中線所在的圖記錄目前頁數
document.getElementById('rdScroll').addEventListener('scroll', () => {
    if (!rd || rdCfg.mode !== 'scroll' || Date.now() - rdSeekAt < 400) return;
    const scroll = document.getElementById('rdScroll');
    const mid = scroll.getBoundingClientRect().top + scroll.clientHeight / 2;
    const imgs = scroll.querySelectorAll('img');
    // 捲到最後一頁的底部：稍等一下（還在底部才算）就自動進入下一話
    const atBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4;
    if (atBottom && !rd.advancing && rd.chIdx < rdChapterList.length - 1) {
        rd.advancing = true;
        const cur = rd;
        setTimeout(() => {
            const still = rd === cur && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4;
            if (still) rdStep(1, false); else if (rd === cur) cur.advancing = false;
        }, 500);
    }
    for (let i = 0; i < imgs.length; i++) {
        const r = imgs[i].getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) {
            if (rd.idx !== i) { rd.idx = i; rdShowPageNo(); rdSavePos(rd.chapter.id, i); }
            break;
        }
    }
}, { passive: true });

// 手勢：雙指縮放；點擊中間顯示/隱藏工具列；翻頁模式點左右或滑動翻頁；捲動模式點上／下捲一屏
(function () {
    const view = document.getElementById('readerView');
    let sx = 0, sy = 0, lx = 0, ly = 0, moved = false, multi = false, pinch = null;
    const toggleBars = () => rdBars(document.getElementById('rdBar').classList.contains('hidden'));
    const forward = left => left ? -1 : 1;   // 固定由左至右
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    const inBars = e => e.target.closest('button, input, #rdFoot, #rdBar');

    // 依點的位置做事：翻頁模式看左右三分之一；捲動模式看上下三分之一
    const tapAt = (x, y) => {
        if (rdCfg.mode === 'paged') {
            const third = window.innerWidth / 3;
            if (rdZ.paged.s > 1) toggleBars();   // 放大時點一下只切換工具列，避免誤翻頁
            else if (x < third) rdTurn(forward(true));
            else if (x > third * 2) rdTurn(forward(false));
            else toggleBars();
        } else {
            const third = window.innerHeight / 3;
            if (y < third) rdScrollScreen(-1);
            else if (y > third * 2) rdScrollScreen(1);
            else toggleBars();
        }
    };

    view.addEventListener('touchstart', e => {
        if (e.target.closest('#rdBar, #rdFoot')) clearTimeout(rdBarTimer);   // 手動操作工具列就不再自動收起
        if (e.touches.length >= 2) {
            multi = true; moved = true;
            const [fx, fy] = mid(e.touches);
            pinch = { d0: dist(e.touches) || 1, z0: rdZoomGet(), fx, fy };
            return;
        }
        multi = false;
        sx = lx = e.touches[0].clientX; sy = ly = e.touches[0].clientY; moved = false;
    }, { passive: true });

    view.addEventListener('touchmove', e => {
        if (e.touches.length >= 2 && pinch) {
            e.preventDefault();
            const [fx, fy] = mid(e.touches);
            rdZoomTo(pinch.z0 * dist(e.touches) / pinch.d0, fx, fy);
            return;
        }
        if (multi) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true;
        // 翻頁模式放大後：單指拖曳移動圖片
        if (rdCfg.mode === 'paged' && rdZ.paged.s > 1 && !inBars(e)) {
            e.preventDefault();
            rdZ.paged.x += t.clientX - lx;
            rdZ.paged.y += t.clientY - ly;
            rdClampPaged();
            rdApplyPaged();
        }
        lx = t.clientX; ly = t.clientY;
    }, { passive: false });

    view.addEventListener('touchend', e => {
        if (e.touches.length > 0) return;                    // 還有手指在螢幕上
        if (multi) { multi = false; pinch = null; return; }  // 縮放結束，不當成點擊
        if (inBars(e)) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (rdCfg.mode === 'paged' && rdZ.paged.s <= 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            rdTurn(forward(dx > 0));   // 向右滑 = 往左邊的方向
            return;
        }
        if (moved) return;
        tapAt(t.clientX, t.clientY);
    });

    view.addEventListener('click', e => {
        if (inBars(e) || 'ontouchstart' in window) return;
        tapAt(e.clientX, e.clientY);
    });
    document.addEventListener('keydown', e => {
        if (!rd) return;
        if (e.key === 'Escape') rdClose();
        else if (rdCfg.mode === 'paged' && e.key === 'ArrowLeft') rdTurn(forward(true));
        else if (rdCfg.mode === 'paged' && e.key === 'ArrowRight') rdTurn(forward(false));
    });
})();
