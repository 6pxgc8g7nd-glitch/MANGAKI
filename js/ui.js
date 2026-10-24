// 共用介面：訊息與確認視窗、自訂下拉選單、捲動

function handleImgError(imgEl) {
    // http 圖片在 https 頁面會被瀏覽器擋下，先試一次 https
    if (imgEl.src.startsWith('http://') && !imgEl.dataset.retried) {
        imgEl.dataset.retried = '1';
        imgEl.src = imgEl.src.replace('http://', 'https://');
        return;
    }
    const parent = imgEl.parentElement;
    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-3xl"><i class="fa-solid fa-book-open" style="color:#b5b5b5"></i></div>';
}

function saveComics() {
    try {
        localStorage.setItem('mangaki_comics', JSON.stringify(comics));
        ghScheduleAuto();
    } catch (error) {
        console.error('MANGAKI 儲存失敗：', error);
        showMsg('儲存失敗', '無法寫入瀏覽器儲存空間，請先匯出備份。');
    }
}

function showMsg(title, text) {
    document.getElementById('msgTitle').innerText = title;
    document.getElementById('msgText').innerText = text;
    // 失敗／錯誤類訊息用警告圖示，其餘用打勾
    const isProblem = /失敗|錯誤|格式|不完整|不足|無法|沒有資料|沒有漫畫|尚未|驗證|找不到|遺失|沒有可匯入|請先/.test(title);
    const icon = document.getElementById('msgIcon');
    icon.innerHTML = `<i class="fa-solid ${isProblem ? 'fa-triangle-exclamation' : 'fa-check'}"></i>`;
    document.getElementById('msgModal').classList.remove('hidden');
}

// 自訂確認視窗（取代系統 confirm），回傳 Promise<boolean>
function showConfirm(title, text, options = {}) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirmModal');
        const ok = document.getElementById('confirmOk');
        const cancel = document.getElementById('confirmCancel');
        document.getElementById('confirmTitle').innerText = title;
        document.getElementById('confirmText').innerText = text;
        document.getElementById('confirmIcon').innerHTML = `<i class="fa-solid ${options.danger ? 'fa-trash-can' : 'fa-question'}"></i>`;
        ok.innerText = options.okText || '確定';
        cancel.innerText = options.cancelText || '取消';
        const done = result => {
            modal.classList.add('hidden');
            ok.onclick = cancel.onclick = modal.onclick = null;
            resolve(result);
        };
        ok.onclick = () => done(true);
        cancel.onclick = () => done(false);
        modal.onclick = e => { if (e.target === modal) done(false); };
        modal.classList.remove('hidden');
    });
}

// 自訂下拉選單（取代系統 select 彈窗）：原 <select> 隱藏但保留，值仍由它儲存
function syncCustomSelects() {
    document.querySelectorAll('select[data-custom]').forEach(sel => {
        const label = sel.parentElement.querySelector('.cselect-label');
        if (label) label.innerText = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
    });
}

function openOptionSheet(sel, title) {
    const sheet = document.getElementById('optionSheet');
    const list = document.getElementById('optionSheetList');
    document.getElementById('optionSheetTitle').innerText = title;
    list.className = 'grid grid-cols-2 gap-2';
    list.innerHTML = '';
    Array.from(sel.options).forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-item' + (opt.value === sel.value ? ' is-selected' : '');
        btn.innerHTML = '<span></span><i class="fa-solid fa-check"></i>';
        btn.firstChild.innerText = opt.text;
        btn.onclick = () => {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            syncCustomSelects();
            close();
        };
        list.appendChild(btn);
    });
    const close = () => { sheet.classList.add('hidden'); sheet.onclick = null; document.getElementById('optionSheetCancel').onclick = null; };
    document.getElementById('optionSheetCancel').onclick = close;
    sheet.onclick = e => { if (e.target === sheet) close(); };
    sheet.classList.remove('hidden');
}

function initCustomSelects() {
    document.querySelectorAll('select:not([data-custom])').forEach(sel => {
        sel.setAttribute('data-custom', '1');
        sel.style.display = 'none';
        const title = sel.parentElement.querySelector('label span')?.innerText || '請選擇';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cselect-btn';
        btn.innerHTML = '<span class="cselect-label"></span><i class="fa-solid fa-chevron-down"></i>';
        btn.onclick = () => openOptionSheet(sel, title);
        sel.insertAdjacentElement('afterend', btn);
    });
    syncCustomSelects();
}

function closeMsgModal() {
    document.getElementById('msgModal').classList.add('hidden');
}

// 回到內容區最上方（立即，不用平滑捲動，避免換頁時被內容高度變化打斷）
function scrollMainTop() {
    const main = document.querySelector('.app-container > main');
    if (!main) return;
    main.scrollTop = 0;
    requestAnimationFrame(() => { main.scrollTop = 0; });
}

// 點上方語錄：快速（約 0.25 秒）滑回頂端；清單很長時比系統的平滑捲動快得多
let scrollTopAnim = 0;
function scrollMainTopFast() {
    const main = document.querySelector('.app-container > main');
    if (!main) return;
    const from = main.scrollTop;
    cancelAnimationFrame(scrollTopAnim);
    if (from < 4) { main.scrollTop = 0; return; }
    const start = performance.now(), dur = 250;
    const step = now => {
        const t = Math.min(1, (now - start) / dur);
        main.scrollTop = from * (1 - (1 - Math.pow(1 - t, 3)));
        if (t < 1) scrollTopAnim = requestAnimationFrame(step); else main.scrollTop = 0;
    };
    scrollTopAnim = requestAnimationFrame(step);
}
