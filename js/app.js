// 多集連結、卡片手勢與啟動

// ================================
// 多集連結：每部漫畫 links = [{label, url}, ...]，照輸入的順序排列
// ================================
function getLinks(comic) {
    if (Array.isArray(comic.links)) {
        return comic.links
            .map(l => ({ label: String((l && l.label) || '').trim(), url: safeUrl(l && l.url) }))
            .filter(l => l.url);
    }
    const legacy = safeUrl(comic.url);
    return legacy ? [{ label: '', url: legacy }] : [];
}

function latestUrl(links) { return links.length ? links[links.length - 1].url : ''; }

function addLinkRow(box, link) {
    const row = document.createElement('div');
    row.className = 'link-row';
    row.innerHTML = '<input type="text" class="lk-label" maxlength="20" placeholder="第幾話" autocomplete="off">' +
        '<input type="url" class="lk-url" placeholder="https://" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<button type="button" class="link-del" aria-label="刪除這集"><i class="fa-solid fa-xmark"></i></button>';
    row.querySelector('.lk-label').value = (link && link.label) || '';
    row.querySelector('.lk-url').value = (link && link.url) || '';
    row.querySelector('.link-del').onclick = () => {
        row.remove();
        if (!box.children.length) addLinkRow(box);
    };
    box.appendChild(row);
}

function initLinkEditor(box, links) {
    box.innerHTML = '';
    (links && links.length ? links : [null]).forEach(l => addLinkRow(box, l));
}

function readLinks(box) {
    return Array.from(box.querySelectorAll('.link-row')).map(row => ({
        label: row.querySelector('.lk-label').value.trim(),
        url: safeUrl(row.querySelector('.lk-url').value.trim())
    })).filter(l => l.url);
}

// 點卡片：沒有網址提示；只有一個直接開；多個就依序列出集數
function openLinkSheet(links) {
    const sheet = document.getElementById('optionSheet');
    const list = document.getElementById('optionSheetList');
    document.getElementById('optionSheetTitle').innerText = `選擇要開啟的集數（共 ${links.length} 集）`;
    list.className = 'grid grid-cols-3 gap-2';
    list.innerHTML = '';
    const close = () => { sheet.classList.add('hidden'); sheet.onclick = null; document.getElementById('optionSheetCancel').onclick = null; };
    links.forEach((l, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-item link-pick';
        const name = document.createElement('span');
        name.className = 'lp-name';
        name.textContent = l.label || String(i + 1);
        btn.appendChild(name);
        btn.onclick = () => { close(); window.open(l.url, '_blank', 'noopener,noreferrer'); };
        list.appendChild(btn);
    });
    document.getElementById('optionSheetCancel').onclick = close;
    sheet.onclick = e => { if (e.target === sheet) close(); };
    sheet.classList.remove('hidden');
}

// 點卡片：有匯入過圖片就開內建閱讀，否則跳到網址
// 必須同步判斷：await 之後再 window.open 會被手機瀏覽器當成彈出視窗擋掉
function openComicLink(id, skipReader) {
    const comic = comics.find(c => c.id === id);
    if (!comic) return;
    const chapters = skipReader || privacyMode ? 0 : (rdChapterCount.get(id) || 0);
    if (chapters === 1) {
        // 只有一話：直接開閱讀器，接著上次讀到的位置
        activeComicId = id;
        rdOpenFirst(id);
        return;
    }
    if (chapters > 1) {
        // 有多話：跳出和「選擇集數」相同樣式的選單
        activeComicId = id;
        openChapterSheet(id);
        return;
    }
    const links = getLinks(comic);
    if (links.length === 0) {
        showMsg('尚未設定網址', '這部漫畫還沒有網址。長按卡片可以編輯並加上網址。');
    } else if (links.length === 1) {
        window.open(links[0].url, '_blank', 'noopener,noreferrer');
    } else {
        openLinkSheet(links);
    }
}

// 卡片手勢：點擊 → 前往連結；長按 → 編輯
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

function editComicById(id) {
    activeComicId = id;
    openEditModal();
}

function initCardGestures() {
    const list = document.getElementById('comicListContainer');
    let timer = null, startX = 0, startY = 0, pressedId = null, longPressed = false;

    const cancel = () => { clearTimeout(timer); timer = null; pressedId = null; };

    list.addEventListener('pointerdown', e => {
        const card = e.target.closest('[data-id]');
        if (!card) return;
        longPressed = false;
        pressedId = card.dataset.id;
        startX = e.clientX; startY = e.clientY;
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            longPressed = true;
            if (navigator.vibrate) navigator.vibrate(15);
            editComicById(pressedId);
        }, LONG_PRESS_MS);
    });
    list.addEventListener('pointermove', e => {
        if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => list.addEventListener(t, () => { if (timer) cancel(); }));
    list.addEventListener('contextmenu', e => e.preventDefault());
    list.addEventListener('click', e => {
        const card = e.target.closest('[data-id]');
        if (!card) return;
        if (longPressed) { longPressed = false; return; }
        openComicLink(card.dataset.id);
    });
}

// Initialize on load
window.onload = function() {
    initCustomSelects();
    initLinkEditor(document.getElementById('addLinks'), []);
    initCardGestures();
    renderComics();
    rdRefreshFlags();
};
