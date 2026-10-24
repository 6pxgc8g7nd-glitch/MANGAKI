// 漫畫清單：分頁切換、篩選排序、分類、新增／修改／刪除

// 分頁順序（決定轉場的滑動方向）
const TAB_ORDER = ['home', 'categories', 'add', 'settings'];
let currentTab = 'home';

function switchTab(tabName) {
    document.querySelectorAll('.app-container > main > section').forEach(sec => {
        sec.classList.add('hidden');
        delete sec.dataset.enter;
    });
    const targetSection = document.getElementById(`tab-${tabName}`);
    if (targetSection) {
        // 換到別的分頁才播轉場；在同一頁重新整理時不播
        if (tabName !== currentTab) {
            targetSection.dataset.enter = TAB_ORDER.indexOf(tabName) > TAB_ORDER.indexOf(currentTab) ? 'right' : 'left';
        }
        targetSection.classList.remove('hidden');
    }
    currentTab = tabName;

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.id === `nav-${tabName}`);
    });
    // 狀態分頁（全部／連載中／已完結）只在首頁顯示
    document.getElementById('statusTabs').classList.toggle('hidden', tabName !== 'home');

    scrollMainTop();
    if(tabName === 'home') renderComics();
    if(tabName === 'categories') renderCategories();
    if(tabName === 'settings') { ghRenderSettings(); renderUpdateInfo(); if (typeof rdUpdateBackupInfo === 'function') rdUpdateBackupInfo(); }
}
function goHome() {
    currentPage = 1;
    activeGenreFilter = '全部';
    activeStatusFilter = '全部';
    switchTab('home');
}

function filterByGenre(genre) {
    activeGenreFilter = genre;
    currentPage = 1;
    switchTab('home');
}

function getFilteredComics() {
    const list = comics.filter(c =>
        (activeGenreFilter === '全部' || (activeGenreFilter === READER_KEY ? rdChapterCount.has(c.id) : parseGenres(c.genre).includes(activeGenreFilter))) &&
        (activeStatusFilter === '全部' || (c.status || '連載中') === activeStatusFilter)
    );
    // 不再依更新日期排序：維持新增的順序（最新新增的在最前面）
    return list;
}

function setStatusFilter(status) {
    activeStatusFilter = status;
    currentPage = 1;
    renderComics();
    scrollMainTop();
}

function renderStatusTabs() {
    document.querySelectorAll('.status-tab').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.status === activeStatusFilter);
    });
}

function clearGenreFilter() {
    activeGenreFilter = '全部';
    currentPage = 1;
    renderComics();
}

function renderComics() {
    const container = document.getElementById('comicListContainer');
    const filterBannerContainer = document.getElementById('filterBannerContainer');

    if (activeGenreFilter !== '全部') {
        filterBannerContainer.innerHTML = `
            <div class="bg-[#fafafa] border border-[#a6051a]/40 rounded-xl px-3 py-2 flex items-center justify-between text-xs shadow-inner mb-2.5">
                <span class="text-neutral-600">分類篩選：<strong class="text-neutral-900">${escapeHtml(genreLabel(activeGenreFilter))}</strong></span>
                <button onclick="clearGenreFilter()" class="text-[#a6051a] hover:text-[#8a0416] p-1" aria-label="清除篩選">
                    <i class="fa-solid fa-xmark text-sm"></i>
                </button>
            </div>
        `;
    } else {
        filterBannerContainer.innerHTML = '';
    }

    renderStatusTabs();
    updatePrivacyBtn();
    const filteredComics = getFilteredComics();

    document.getElementById('comicCount').innerText = `共 ${filteredComics.length} 部`;

    if (filteredComics.length === 0) {
        container.innerHTML = `
            <div class="bg-[#ffffff] rounded-xl p-6 text-center border border-[#a6051a]/40 text-neutral-600 space-y-2 col-span-2">
                <i class="fa-solid fa-box-open text-2xl"></i>
                <p class="text-xs">目前沒有符合的漫畫紀錄</p>
            </div>
        `;
        renderPagination(0);
        return;
    }

    // 每頁只顯示 10 部漫畫
    const totalPages = Math.ceil(filteredComics.length / comicsPerPage);

    // 刪除資料後，如果目前頁數超出範圍，自動回到最後一頁
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const startIndex = (currentPage - 1) * comicsPerPage;
    const paginatedComics = filteredComics.slice(startIndex, startIndex + comicsPerPage);

    container.className = "grid grid-cols-2 gap-3 items-start";

    const decoyMap = privacyMode ? assignDecoys(paginatedComics) : null;
    container.innerHTML = paginatedComics.map(comic => {
        const coverSrc = privacyMode ? decoyCover(comic.id, decoyMap.get(comic.id)) : safeUrl(comic.coverUrl);
        const coverDisplay = coverSrc ?
            `<div class="w-full cover-box bg-[#fafafa] rounded-xl overflow-hidden relative ">
                <img src="${escapeHtml(coverSrc)}" referrerpolicy="no-referrer" loading="lazy" onload="fitCover(this)" class="w-full h-full object-contain group-hover:scale-105 transition duration-300" onerror="handleImgError(this)">
             </div>` :
            `<div class="w-full cover-box bg-[#fafafa] rounded-xl flex items-center justify-center text-3xl relative">
                <i class="fa-solid fa-book-open" style="color:#b5b5b5"></i>
             </div>`;

        return `
            <div data-id="${escapeHtml(comic.id)}" class="group bg-[#ffffff] hover:bg-[#f0f0f0]  rounded-xl shadow transition cursor-pointer overflow-hidden flex flex-col active:scale-[0.98]">
                <div class="relative">
                    ${coverDisplay}
                    <div class="cover-title"><h4>${escapeHtml(privacyMode ? decoyTitle(comic.id, decoyMap.get(comic.id)) : comic.title)}</h4></div>
                </div>
            </div>
        `;
    }).join('');

    renderPagination(totalPages);
}

// 先提供簡單的「上一頁／下一頁」分頁
// 頁碼列：上一頁、頁碼（含省略號）、下一頁；省略號可點開「跳到第幾頁」
function pageSlots(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 3) return [1, 2, 3, 4, '…', total];
    if (cur >= total - 2) return [1, '…', total - 3, total - 2, total - 1, total];
    return [1, '…', cur - 1, cur, cur + 1, '…', total];
}

function renderPagination(totalPages) {
    const container = document.getElementById('paginationContainer');
    if (!container) return;

    const info = document.getElementById('paginationInfo');
    if (totalPages <= 1) {
        container.innerHTML = '';
        if (info) info.textContent = '';
        return;
    }
    if (info) info.textContent = `第 ${currentPage} / ${totalPages} 頁　·　共 ${getFilteredComics().length} 部`;

    const nav = (label, target, disabled, aria) =>
        `<button class="pg-btn pg-nav" aria-label="${aria}" ${disabled ? 'disabled' : `onclick="changePage(${target})"`}><i class="fa-solid ${label}"></i></button>`;

    const slots = pageSlots(currentPage, totalPages).map(p =>
        p === '…'
            ? `<button class="pg-btn pg-gap" aria-label="跳到指定頁" onclick="openPageJump(${totalPages})">…</button>`
            : (p === currentPage
                ? `<button class="pg-btn is-current" aria-current="page" aria-label="目前第 ${p} 頁">${p}</button>`
                : `<button class="pg-btn" aria-label="第 ${p} 頁" onclick="changePage(${p})">${p}</button>`)
    ).join('');

    container.innerHTML =
        nav('fa-chevron-left', currentPage - 1, currentPage === 1, '上一頁') +
        slots +
        nav('fa-chevron-right', currentPage + 1, currentPage === totalPages, '下一頁');
}

// 頁數很多時：直接選要去的頁碼
function openPageJump(totalPages, cur = currentPage, go = changePage) {
    const sheet = document.getElementById('optionSheet');
    const list = document.getElementById('optionSheetList');
    document.getElementById('optionSheetTitle').innerText = `跳到第幾頁（共 ${totalPages} 頁）`;
    list.className = 'grid grid-cols-5 gap-2';
    list.innerHTML = '';
    for (let p = 1; p <= totalPages; p++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-item page-jump-item' + (p === cur ? ' is-selected' : '');
        btn.textContent = String(p);
        btn.onclick = () => { close(); go(p); };
        list.appendChild(btn);
    }
    const close = () => { sheet.classList.add('hidden'); sheet.onclick = null; document.getElementById('optionSheetCancel').onclick = null; };
    document.getElementById('optionSheetCancel').onclick = close;
    sheet.onclick = e => { if (e.target === sheet) close(); };
    sheet.classList.remove('hidden');
}

function changePage(page) {
    const filteredCount = getFilteredComics().length;

    const totalPages = Math.ceil(filteredCount / comicsPerPage);

    if (page < 1 || page > totalPages) return;

    currentPage = page;
    renderComics();

    // 換頁後回到漫畫列表頂端
    scrollMainTop();
}

function renderCategories() {
    const genreGrid = document.getElementById('genreGrid');
    let allGenresSet = new Set();
    comics.forEach(c => {
        parseGenres(c.genre).forEach(g => allGenresSet.add(g));
    });
    const allGenres = ['全部', READER_KEY, ...allGenresSet];
    const totalCatPages = Math.max(1, Math.ceil(allGenres.length / genresPerPage));
    if (catPage > totalCatPages) catPage = totalCatPages;
    if (catPage < 1) catPage = 1;
    const genres = allGenres.slice((catPage - 1) * genresPerPage, catPage * genresPerPage);

    genreGrid.innerHTML = genres.map(g => {
        const count = g === '全部' ? comics.length : g === READER_KEY ? comics.filter(c => rdChapterCount.has(c.id)).length : comics.filter(c => parseGenres(c.genre).includes(g)).length;
        const isSelected = activeGenreFilter === g;
        const activeStyle = isSelected ? 'border-[#a6051a] bg-[#f0f0f0] ring-1 ring-[#a6051a]/40' : 'border-[#a6051a]/40 hover:border-[#a6051a]';

        return `
            <div data-genre="${escapeHtml(g)}" onclick="filterByGenre(this.dataset.genre)" class="genre-card bg-[#ffffff] ${activeStyle} p-3.5 rounded-xl border flex items-center justify-between shadow cursor-pointer transition active:scale-[0.98]">
                <span class="font-bold text-xs text-neutral-900">${g === READER_KEY ? '<i class="fa-solid fa-book-open-reader text-[#a6051a] mr-1"></i>' : ''}${escapeHtml(genreLabel(g))}</span>
                <span class="text-xs bg-[#fafafa] px-2 py-0.5 rounded-full text-neutral-600 border border-[#a6051a]/40">${count} 部</span>
            </div>
        `;
    }).join('');
    renderCatPagination(totalCatPages);
}

function renderCatPagination(total) {
    const box = document.getElementById('catPagination');
    if (!box) return;
    const info = document.getElementById('catPaginationInfo');
    if (total <= 1) { box.innerHTML = ''; if (info) info.textContent = ''; return; }
    if (info) info.textContent = `第 ${catPage} / ${total} 頁`;
    const nav = (icon, target, disabled, aria) =>
        `<button class="pg-btn pg-nav" aria-label="${aria}" ${disabled ? 'disabled' : `onclick="changeCatPage(${target})"`}><i class="fa-solid ${icon}"></i></button>`;
    const slots = pageSlots(catPage, total).map(p =>
        p === '…'
            ? `<button class="pg-btn pg-gap" aria-label="跳到指定頁" onclick="openPageJump(${total}, catPage, changeCatPage)">…</button>`
            : (p === catPage
                ? `<button class="pg-btn is-current" aria-current="page" aria-label="目前第 ${p} 頁">${p}</button>`
                : `<button class="pg-btn" aria-label="第 ${p} 頁" onclick="changeCatPage(${p})">${p}</button>`)
    ).join('');
    box.innerHTML = nav('fa-chevron-left', catPage - 1, catPage === 1, '上一頁') + slots + nav('fa-chevron-right', catPage + 1, catPage === total, '下一頁');
}

function changeCatPage(page) {
    catPage = page;
    renderCategories();
    scrollMainTop();
}

function handleAddNewComic(e) {
    e.preventDefault();
    if (checkDuplicates('add')) return;   // 名稱或封面重複：不能儲存（紅字已顯示）
    const statusInput = document.querySelector('input[name="inputStatus"]:checked');
    const addLinksValue = readLinks(document.getElementById('addLinks'));
    const newComic = {
        id: Date.now().toString(),
        title: document.getElementById('inputTitle').value.trim(),
        genre: document.getElementById('inputGenre').value.trim(),
        status: statusInput ? statusInput.value : '連載中',
        links: addLinksValue,
        url: latestUrl(addLinksValue),
        coverUrl: safeUrl(document.getElementById('inputCoverUrl').value.trim()),
        progress: 0
    };

    comics.unshift(newComic);
    saveComics();
    document.getElementById('addComicForm').reset();
    checkDuplicates('add');   // 清掉紅字
    initLinkEditor(document.getElementById('addLinks'), []);
    syncCustomSelects();
    showMsg('新增成功', '已成功將漫畫加入追蹤清單！');
    switchTab('home');
}

function openComicModal(id) {
    activeComicId = id;
    const comic = comics.find(c => c.id === id);
    if (!comic) return;

    const modalEmojiContainer = document.getElementById('modalEmojiContainer');
    const coverSrc = safeUrl(comic.coverUrl);
    const bookIcon = '<i class="fa-solid fa-book-open" style="color:#b5b5b5"></i>';
    modalEmojiContainer.innerHTML = bookIcon;
    if (coverSrc) {
        const img = document.createElement('img');
        img.referrerPolicy = 'no-referrer';
        img.src = coverSrc;
        img.className = 'w-full h-full object-contain';
        img.onerror = () => { modalEmojiContainer.innerHTML = bookIcon; };
        modalEmojiContainer.innerText = '';
        modalEmojiContainer.appendChild(img);
    }

    document.getElementById('modalTitle').innerText = comic.title;
    document.getElementById('modalReadBtn').classList.toggle('hidden', privacyMode);
    document.getElementById('modalGenre').innerText = `分類：${(comic.genre || '').trim() || '未分類'} | 狀態：${comic.status || '連載中'}`;

    const urlBox = document.getElementById('modalUrlBox');
    const urlLink = document.getElementById('modalUrlLink');
    const linkHref = safeUrl(comic.url);
    if (linkHref) {
        urlLink.href = linkHref;
        urlLink.rel = 'noopener noreferrer';
        urlBox.classList.remove('hidden');
    } else {
        urlBox.classList.add('hidden');
    }
        document.getElementById('comicModal').classList.remove('hidden');
}
function closeComicModal() {
        document.getElementById('comicModal').classList.add('hidden');
}

function openEditModal() {
    closeComicModal();
    const comic = comics.find(c => c.id === activeComicId);
    if (!comic) return;

    document.getElementById('editReadBtn').classList.toggle('hidden', privacyMode);
    document.getElementById('editInputTitle').value = comic.title;
    document.getElementById('editInputGenre').value = comic.genre;
    initLinkEditor(document.getElementById('editLinks'), getLinks(comic));
    document.getElementById('editInputCoverUrl').value = comic.coverUrl || '';
    syncCustomSelects();

    const statusRadios = document.querySelectorAll('input[name="editInputStatus"]');
    statusRadios.forEach(radio => {
        radio.checked = (radio.value === (comic.status || '連載中'));
    });

    document.getElementById('editModal').classList.remove('hidden');
    checkDuplicates('edit');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

function handleUpdateComic(e) {
    e.preventDefault();
    if (checkDuplicates('edit')) return;
    const comicIndex = comics.findIndex(c => c.id === activeComicId);
    if (comicIndex === -1) return;

    const statusInput = document.querySelector('input[name="editInputStatus"]:checked');
    comics[comicIndex].title = document.getElementById('editInputTitle').value.trim();
    comics[comicIndex].genre = document.getElementById('editInputGenre').value.trim();
    comics[comicIndex].status = statusInput ? statusInput.value : '連載中';
    const editedLinks = readLinks(document.getElementById('editLinks'));
    comics[comicIndex].links = editedLinks;
    comics[comicIndex].url = latestUrl(editedLinks);
    comics[comicIndex].coverUrl = safeUrl(document.getElementById('editInputCoverUrl').value.trim());
    delete comics[comicIndex].updateDay;      // 舊資料裡的更新日期欄位一併清掉
    delete comics[comicIndex].updatedAt;

    saveComics();
    closeEditModal();
    showMsg('修改成功', '漫畫資訊已成功更新！');
    renderComics();
}

async function deleteCurrentComic() {
    const comic = comics.find(c => c.id === activeComicId);
    if (!comic) return;

    if (!(await showConfirm('刪除漫畫', `確定要刪除「${comic.title}」嗎？\n\n刪除後無法復原。`, { danger: true, okText: '刪除' }))) return;

    rdDeleteComic(activeComicId);
    comics = comics.filter(c => c.id !== activeComicId);
    saveComics();
    closeComicModal();
    closeEditModal();
    showMsg('刪除成功', '已從追蹤清單移除該漫畫。');
    renderComics();
}

// ================================
// 資料備份功能
// ================================

// ===== 重複偵測：名稱、封面網址不能和別部漫畫重複 =====
// 封面網址的比對：忽略 http／https、網域大小寫、結尾的斜線與 # 後面的部分
function normCoverUrl(url) {
    const u = safeUrl(String(url || '').trim());
    if (!u) return '';
    try {
        const p = new URL(u);
        return p.hostname.toLowerCase() + p.pathname.replace(/\/+$/, '') + p.search;
    } catch (e) { return u.toLowerCase(); }
}

// 找出和這個名稱／封面重複的另一部漫畫。excludeId：編輯時排除自己
function findDuplicates(title, coverUrl, excludeId) {
    const nt = normTitle(title), nc = normCoverUrl(coverUrl);
    const out = { name: null, cover: null };
    for (const c of comics) {
        if (c.id === excludeId) continue;
        if (nt && !out.name && normTitle(c.title) === nt) out.name = c;
        if (nc && !out.cover && normCoverUrl(c.coverUrl) === nc) out.cover = c;
        if (out.name && out.cover) break;
    }
    return out;
}

// 檢查表單（'add' 或 'edit'），顯示紅字並鎖住儲存按鈕；有重複時回傳 true
function checkDuplicates(kind) {
    const edit = kind === 'edit';
    const q = id => document.getElementById(id);
    const titleEl = q(edit ? 'editInputTitle' : 'inputTitle'), coverEl = q(edit ? 'editInputCoverUrl' : 'inputCoverUrl');
    const nameWarn = q(edit ? 'editDupTitle' : 'addDupTitle'), coverWarn = q(edit ? 'editDupCover' : 'addDupCover');
    const submit = document.querySelector(edit ? '#editComicForm button[type="submit"]' : '#addComicForm button[type="submit"]');
    if (!titleEl || !coverEl || !nameWarn || !coverWarn || !submit) return false;

    const self = edit ? comics.find(c => c.id === activeComicId) : null;
    const title = titleEl.value, cover = coverEl.value;
    const dup = findDuplicates(title, cover, self && self.id);
    // 編輯時，沒改過的欄位不檢查：以前就重複的舊資料不會讓你連別的欄位都改不了
    if (self && normTitle(title) === normTitle(self.title)) dup.name = null;
    if (self && normCoverUrl(cover) === normCoverUrl(self.coverUrl)) dup.cover = null;

    // 遮蔽模式下不要把真實名稱顯示出來
    const label = c => privacyMode ? '' : `「${c.title}」`;
    const show = (el, input, other, text) => {
        el.textContent = other ? text(other) : '';
        el.classList.toggle('hidden', !other);
        input.classList.toggle('input-dup', !!other);
    };
    show(nameWarn, titleEl, dup.name, c => `已有同名的漫畫${label(c)}，無法儲存`);
    show(coverWarn, coverEl, dup.cover, c => `這張封面已被另一部漫畫${label(c)}使用，無法儲存`);
    const blocked = !!(dup.name || dup.cover);
    submit.disabled = blocked;
    return blocked;
}

function initDuplicateCheck() {
    [['inputTitle', 'add'], ['inputCoverUrl', 'add'], ['editInputTitle', 'edit'], ['editInputCoverUrl', 'edit']].forEach(([id, kind]) => {
        const el = document.getElementById(id);
        if (!el) return;
        ['input', 'change'].forEach(ev => el.addEventListener(ev, () => checkDuplicates(kind)));
    });
}
