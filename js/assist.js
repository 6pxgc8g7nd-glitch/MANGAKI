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
    }, 3000);
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
    // 圖案：黃色爆炸框（尖刺、粗黑邊、圓角接合）+ 網點 + 對話框（漫畫風）；用內嵌 SVG，不需要連網載入圖示
    assistBtn.innerHTML = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><defs><clipPath id="abClip"><path d="M34.1 1.6 L38.6 10.4 L46.0 7.5 L46.6 16.1 L57.7 14.3 L53.4 23.5 L59.3 27.8 L53.9 33.5 L60.7 40.7 L51.6 43.2 L53.4 51.6 L44.3 49.8 L43.7 61.4 L35.5 54.7 L29.9 62.4 L25.6 53.1 L18.0 56.5 L16.7 48.6 L6.3 49.7 L11.9 40.0 L4.7 36.2 L9.1 30.4 L3.3 23.3 L12.9 21.1 L10.6 12.4 L19.2 13.4 L20.3 2.6 L28.7 10.7Z"/></clipPath><pattern id="abDots" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3" cy="3" r="1.35" fill="#a6051a"/></pattern></defs><path d="M34.1 1.6 L38.6 10.4 L46.0 7.5 L46.6 16.1 L57.7 14.3 L53.4 23.5 L59.3 27.8 L53.9 33.5 L60.7 40.7 L51.6 43.2 L53.4 51.6 L44.3 49.8 L43.7 61.4 L35.5 54.7 L29.9 62.4 L25.6 53.1 L18.0 56.5 L16.7 48.6 L6.3 49.7 L11.9 40.0 L4.7 36.2 L9.1 30.4 L3.3 23.3 L12.9 21.1 L10.6 12.4 L19.2 13.4 L20.3 2.6 L28.7 10.7Z" fill="#ffd400"/><g clip-path="url(#abClip)"><rect x="0" y="38" width="64" height="30" fill="url(#abDots)" opacity=".9"/></g><path d="M34.1 1.6 L38.6 10.4 L46.0 7.5 L46.6 16.1 L57.7 14.3 L53.4 23.5 L59.3 27.8 L53.9 33.5 L60.7 40.7 L51.6 43.2 L53.4 51.6 L44.3 49.8 L43.7 61.4 L35.5 54.7 L29.9 62.4 L25.6 53.1 L18.0 56.5 L16.7 48.6 L6.3 49.7 L11.9 40.0 L4.7 36.2 L9.1 30.4 L3.3 23.3 L12.9 21.1 L10.6 12.4 L19.2 13.4 L20.3 2.6 L28.7 10.7Z" fill="none" stroke="#111" stroke-width="3.6" stroke-linejoin="round"/><g transform="translate(32 32.5) scale(.82) translate(-32 -31)"><path d="M17.5 24.5Q17.5 15.5 26.5 15.5H37.5Q46.5 15.5 46.5 24.5V28.5Q46.5 37.5 37.5 37.5H31.5L23.5 45.5L25 37.5H26.5Q17.5 37.5 17.5 28.5Z" fill="#fff" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/><circle cx="26" cy="26.5" r="2.5" fill="#111"/><circle cx="32" cy="26.5" r="2.5" fill="#111"/><circle cx="38" cy="26.5" r="2.5" fill="#111"/></g></svg>';
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
