// 懸浮按鈕（輔助觸控）：可拖曳、自動吸附左右邊緣、閒置時變半透明；點一下展開快速功能。
// 全域顯示：每個頁面都有；進入閱讀器時改成閱讀器專用的功能。
const ASSIST_POS_KEY = 'mangaki_assist_pos';
const ASSIST_ON_KEY = 'mangaki_assist_on';
const ASSIST_SIZE = 54;
const ASSIST_GAP = 6;
const ASSIST_TAIL = 22;   // 對話框尾巴的長度，面板與按鈕之間留這麼寬

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
    }, 2000);
}

// 存位置：只在拖曳放開時存。不要在離開頁面時再存，啟動時若剛好讀到空值，會把預設位置寫回去蓋掉真正存的位置
function assistSavePos() {
    try { localStorage.setItem(ASSIST_POS_KEY, JSON.stringify(assistPos)); } catch (e) {}
}

const assistInReader = () => !document.getElementById('readerView').classList.contains('hidden');

function assistItems() {
    if (assistInReader()) {
        return [
            { icon: 'fa-backward-step', label: '上一話', run: () => rdStep(-1, true) },
            { icon: 'fa-forward-step', label: '下一話', run: () => rdStep(1, true) },
            { icon: 'fa-table-columns', label: rdCfg.mode === 'scroll' ? '改翻頁' : '改捲動', run: () => rdToggleMode() },
            { icon: 'fa-arrow-left', label: '離開閱讀', run: () => rdClose() }
        ];
    }
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
    // 像按鈕在說話：面板放在按鈕朝畫面內側的那一邊，尾巴指向按鈕的正中央
    const bb = assistBtn.getBoundingClientRect(), pw = assistPanel.offsetWidth, ph = assistPanel.offsetHeight;
    const box = document.querySelector('.app-container').getBoundingClientRect();
    const onRight = assistPos.side === 'right';   // 按鈕在右邊 → 面板在它左邊，尾巴長在面板右側
    const x = assistClamp(onRight ? bb.left - pw - ASSIST_TAIL : bb.right + ASSIST_TAIL, box.left + 4, box.right - pw - 4);
    const y = assistClamp(bb.top + bb.height / 2 - ph / 2, assistBounds().top, window.innerHeight - ph - 8);
    const tailY = assistClamp(bb.top + bb.height / 2 - y, 24, ph - 24);   // 尾巴在面板上的高度（避開圓角）
    assistPanel.classList.toggle('tail-right', onRight);
    assistPanel.classList.toggle('tail-left', !onRight);
    assistPanel.style.setProperty('--tail-y', `${Math.round(tailY)}px`);
    assistPanel.style.left = `${Math.round(x)}px`;
    assistPanel.style.top = `${Math.round(y)}px`;
    assistPanel.style.transformOrigin = `${onRight ? '100%' : '0%'} ${Math.round(tailY)}px`;   // 從尾巴尖端彈出來
    assistWake();
}

function assistClosePanel() {
    if (!assistPanel) return;
    assistPanel.classList.add('hidden');
    assistBackdrop.classList.add('hidden');
    assistWake();
}

// 顯示與否只看開關（可在設定頁整個關掉）；閱讀器全螢幕蓋在最上層，所以進入閱讀器時把按鈕的層級抬到它上面
function assistRefresh() {
    if (!assistBtn) return;
    const show = assistEnabled();
    const reader = assistInReader();
    assistBackdrop.style.zIndex = reader ? '55' : '';
    assistBtn.style.zIndex = reader ? '56' : '';
    assistPanel.style.zIndex = reader ? '57' : '';
    assistClosePanel();   // 換了畫面（頁面／閱讀器）就先收起面板，避免面板內容過期
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
    // 圖案：圓形的四格分鏡（黃／網點／紅／黑四格，粗黑邊），漫畫的分格感；用內嵌 SVG，不需要連網載入圖示
    assistBtn.innerHTML = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><defs><clipPath id="abClip"><circle cx="32" cy="32" r="27"/></clipPath><pattern id="abDots" width="5.5" height="5.5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.75" cy="2.75" r="1.25" fill="#a6051a"/></pattern></defs><circle cx="32" cy="32" r="30" fill="#fff"/><g clip-path="url(#abClip)" stroke="#111" stroke-width="2" stroke-linejoin="round"><path d="M-6.5 -6.6 L34.2 -6.6 L30.7 30.6 L-6.5 28.2Z" fill="#ffd400"/><path d="M37.0 -6.6 L70.7 -6.6 L70.7 33.0 L33.5 30.6Z" fill="#fff"/><path d="M37.0 -6.6 L70.7 -6.6 L70.7 33.0 L33.5 30.6Z" fill="url(#abDots)" stroke="none"/><path d="M-6.7 31.0 L30.5 33.4 L27.0 70.6 L-6.7 70.6Z" fill="#a6051a"/><path d="M33.3 33.4 L70.5 35.8 L70.5 70.6 L29.8 70.6Z" fill="#111"/></g><path d="M20 12.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/><g stroke="#fff" stroke-width="1.6" stroke-linecap="round"><path d="M13 44l6-3"/><path d="M12 49l7 0"/><path d="M14 54l6 3"/></g><g fill="#ffd400"><circle cx="43" cy="44" r="2.3"/><circle cx="49" cy="44" r="2.3"/><circle cx="46" cy="50" r="2.3"/></g><circle cx="32" cy="32" r="30" fill="none" stroke="#111" stroke-width="4"/><path d="M12.5 21A21 21 0 0 1 21 12.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/></svg>';
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
            assistSavePos();
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
