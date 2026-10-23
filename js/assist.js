// 懸浮按鈕（輔助觸控）：可拖曳、自動吸附左右邊緣、閒置時變半透明；點一下展開快速功能。
// 設定頁與閱讀器不顯示（閱讀器本身蓋在最上層）。
const ASSIST_POS_KEY = 'mangaki_assist_pos';
const ASSIST_ON_KEY = 'mangaki_assist_on';
const ASSIST_SIZE = 50;
const ASSIST_GAP = 6;

let assistBtn = null, assistPanel = null, assistBackdrop = null, assistIdleTimer = 0;
let assistPos = { side: 'right', y: 0.68 };   // side：貼哪一邊；y：高度佔螢幕的比例
try { Object.assign(assistPos, JSON.parse(localStorage.getItem(ASSIST_POS_KEY)) || {}); } catch (e) {}

function assistEnabled() {
    try { return localStorage.getItem(ASSIST_ON_KEY) !== '0'; } catch (e) { return true; }
}

async function setAssistEnabled(on) {
    if (!on && !(await showConfirm('關閉懸浮按鈕', '新增漫畫和一鍵遮蔽只能從這顆按鈕進入。\n\n關閉後就沒有入口了，要關閉嗎？', { okText: '關閉' }))) {
        assistRefresh();   // 取消：把開關還原
        return;
    }
    try { localStorage.setItem(ASSIST_ON_KEY, on ? '1' : '0'); } catch (e) {}
    assistRefresh();
}

// 可活動的範圍：手機是整個畫面；電腦上 App 是置中的窄欄，就限制在那一欄裡
function assistBounds() {
    const box = document.querySelector('.app-container').getBoundingClientRect();
    const main = document.querySelector('.app-container > main');
    const top = (main ? main.getBoundingClientRect().top : 0) + ASSIST_GAP;
    return { left: box.left + ASSIST_GAP, right: box.right - ASSIST_SIZE - ASSIST_GAP, top, bottom: window.innerHeight - ASSIST_SIZE - ASSIST_GAP - 8 };
}

const assistClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function assistPlace() {
    if (!assistBtn) return;
    const b = assistBounds();
    const x = assistPos.side === 'left' ? b.left : b.right;
    const y = assistClamp(assistPos.y * window.innerHeight - ASSIST_SIZE / 2, b.top, b.bottom);
    assistBtn.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function assistWake() {
    if (!assistBtn) return;
    assistBtn.classList.remove('is-idle');
    clearTimeout(assistIdleTimer);
    assistIdleTimer = setTimeout(() => {
        if (assistPanel && !assistPanel.classList.contains('hidden')) return;   // 展開中不淡出
        assistBtn.classList.add('is-idle');
    }, 3000);
}

function assistItems() {
    return [
        { icon: privacyMode ? 'fa-eye' : 'fa-eye-slash', label: privacyMode ? '取消遮蔽' : '一鍵遮蔽', run: () => togglePrivacy() },
        { icon: 'fa-arrow-up', label: '回到頂端', run: () => scrollMainTopFast() },
        { icon: 'fa-plus', label: '新增漫畫', run: () => switchTab('add') },
        { icon: 'fa-cloud-arrow-up', label: '立即備份', run: () => ghBackupNow(true) }
    ];
}

function assistOpenPanel() {
    assistPanel.textContent = '';
    assistItems().forEach(it => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'assist-item';
        const i = document.createElement('i');
        i.className = 'fa-solid ' + it.icon;
        const t = document.createElement('span');
        t.textContent = it.label;
        b.append(i, t);
        b.onclick = () => { assistClosePanel(); it.run(); };
        assistPanel.appendChild(b);
    });
    assistPanel.classList.remove('hidden');
    assistBackdrop.classList.remove('hidden');
    // 面板放在按鈕朝畫面內側的那一邊，垂直置中在按鈕旁
    const bb = assistBtn.getBoundingClientRect(), pw = assistPanel.offsetWidth, ph = assistPanel.offsetHeight;
    const box = document.querySelector('.app-container').getBoundingClientRect();
    const x = assistPos.side === 'left' ? bb.right + 8 : bb.left - pw - 8;
    const y = assistClamp(bb.top + bb.height / 2 - ph / 2, assistBounds().top, window.innerHeight - ph - 8);
    assistPanel.style.transform = `translate(${Math.round(assistClamp(x, box.left + 4, box.right - pw - 4))}px, ${Math.round(y)}px)`;
    assistWake();
}

function assistClosePanel() {
    if (!assistPanel) return;
    assistPanel.classList.add('hidden');
    assistBackdrop.classList.add('hidden');
    assistWake();
}

// 依目前分頁決定顯示與否（設定頁不顯示；也可在設定頁整個關掉）
function assistRefresh() {
    if (!assistBtn) return;
    const show = assistEnabled() && currentTab !== 'settings';
    assistBtn.classList.toggle('hidden', !show);
    if (!show) assistClosePanel();
    else { assistPlace(); assistWake(); }
    const toggle = document.getElementById('assistToggle');
    if (toggle) toggle.checked = assistEnabled();
}

function initAssist() {
    assistBackdrop = document.createElement('div');
    assistBackdrop.id = 'assistBackdrop';
    assistBackdrop.className = 'hidden';
    assistBackdrop.onclick = assistClosePanel;
    assistPanel = document.createElement('div');
    assistPanel.id = 'assistPanel';
    assistPanel.className = 'hidden';
    assistBtn = document.createElement('div');
    assistBtn.id = 'assistBtn';
    assistBtn.setAttribute('role', 'button');
    assistBtn.setAttribute('aria-label', '快速功能');
    assistBtn.innerHTML = '<i class="fa-solid fa-circle-dot"></i>';
    // 放進 .app-container：它是固定定位、自成一個疊放層，放在外面的話層級再低也會蓋住視窗和閱讀器
    document.querySelector('.app-container').append(assistBackdrop, assistPanel, assistBtn);

    // 拖曳：移動超過 6px 才算拖曳；放開後吸附到左或右邊；沒移動就是點一下
    let startX = 0, startY = 0, originX = 0, originY = 0, dragging = false, down = false;
    assistBtn.addEventListener('pointerdown', e => {
        down = true; dragging = false;
        startX = e.clientX; startY = e.clientY;
        const r = assistBtn.getBoundingClientRect();
        originX = r.left; originY = r.top;
        assistBtn.setPointerCapture(e.pointerId);
        assistWake();
    });
    assistBtn.addEventListener('pointermove', e => {
        if (!down) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 6) {
            dragging = true;
            assistClosePanel();
            assistBtn.classList.add('is-dragging');
        }
        if (dragging) {
            const b = assistBounds();
            const x = assistClamp(originX + dx, b.left, b.right), y = assistClamp(originY + dy, b.top, b.bottom);
            assistBtn.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        }
    });
    const end = (e, cancelled) => {
        if (!down) return;
        down = false;
        assistBtn.classList.remove('is-dragging');
        if (dragging) {
            const r = assistBtn.getBoundingClientRect();
            const box = document.querySelector('.app-container').getBoundingClientRect();
            assistPos.side = (r.left + r.width / 2) < (box.left + box.width / 2) ? 'left' : 'right';
            assistPos.y = (r.top + r.height / 2) / window.innerHeight;
            try { localStorage.setItem(ASSIST_POS_KEY, JSON.stringify(assistPos)); } catch (err) {}
            assistPlace();
            assistWake();
        } else if (!cancelled) {
            if (assistPanel.classList.contains('hidden')) assistOpenPanel(); else assistClosePanel();
        }
    };
    assistBtn.addEventListener('pointerup', e => end(e, false));
    assistBtn.addEventListener('pointercancel', e => end(e, true));
    assistBtn.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('resize', () => { assistPlace(); if (!assistPanel.classList.contains('hidden')) assistClosePanel(); });

    assistRefresh();
}

initAssist();
