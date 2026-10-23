// GitHub 自動備份

// ================================
// GitHub 自動備份（權杖只存在本機 localStorage）
// ================================
const GH_KEY = 'mangaki_gh_cfg';
const GH_STATUS_KEY = 'mangaki_gh_status';
const GH_DELAY_MS = 8000;
let ghTimer = null;
let ghBusy = false;
let ghPending = false;

function ghLoad() {
    try { return JSON.parse(localStorage.getItem(GH_KEY)) || {}; } catch (e) { return {}; }
}

function ghStoreCfg(cfg) {
    try { localStorage.setItem(GH_KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; }
}

function ghSetStatus(ok, text) {
    const status = { ok, text, time: Date.now() };
    try { localStorage.setItem(GH_STATUS_KEY, JSON.stringify(status)); } catch (e) {}
    ghShowStatus();
}

function ghShowStatus() {
    const el = document.getElementById('ghStatus');
    if (!el) return;
    let status = null;
    try { status = JSON.parse(localStorage.getItem(GH_STATUS_KEY)); } catch (e) {}
    if (!status) { el.innerText = ''; return; }
    const t = new Date(status.time).toLocaleString('zh-TW', { hour12: false });
    const icon = document.createElement('i');
    icon.className = 'fa-solid ' + (status.ok ? 'fa-circle-check' : 'fa-triangle-exclamation');
    icon.style.color = status.ok ? '#111' : '#a6051a';
    icon.style.marginRight = '6px';
    el.textContent = `${t}　${status.text}`;
    el.insertBefore(icon, el.firstChild);
}

function ghCfgError(cfg) {
    if (!cfg.token) return '請輸入權杖';
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg.repo || '')) return '儲存庫格式要是「擁有者/名稱」';
    if (!/^[A-Za-z0-9_.\/-]+$/.test(cfg.branch || '') || cfg.branch.includes('..')) return '分支名稱格式不正確';
    if (!/^[A-Za-z0-9_.\/-]+$/.test(cfg.path || '') || cfg.path.includes('..') || cfg.path.startsWith('/')) return '檔案路徑格式不正確';
    return '';
}

function ghHeaders(cfg, extra) {
    return Object.assign({
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    }, extra || {});
}

function ghFileUrl(cfg) {
    return `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
}

function ghToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
}

function ghFromBase64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

function ghErrorText(status) {
    if (status === 401) return '權杖無效或已過期';
    if (status === 403) return '權限不足或被限流（需要 Contents: Read and write）';
    if (status === 404) return '找不到儲存庫、分支，或權杖沒有這個儲存庫的權限';
    if (status === 409 || status === 422) return '分支不存在或檔案有衝突，請確認分支名稱';
    return `GitHub 回應錯誤（${status}）`;
}

function ghRenderSettings() {
    const cfg = ghLoad();
    // 權杖不回填到欄位（不顯示圓點）：存好之後欄位保持空白，用提示文字說明已儲存
    const tokenEl = document.getElementById('ghToken');
    if (tokenEl) {
        tokenEl.value = '';
        tokenEl.placeholder = cfg.token ? '已儲存權杖（不顯示），要更換請重新貼上' : '貼上權杖 github_pat_...';
    }
    const auto = document.getElementById('ghAuto');
    if (auto) auto.checked = cfg.auto !== false;
    ghShowStatus();
}

// 只用權杖找出它授權的儲存庫；必須剛好一個，避免寫到不對的庫
async function ghDiscoverRepo(token) {
    const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: ghHeaders({ token }),
        cache: 'no-store'
    });
    if (!res.ok) throw new Error(ghErrorText(res.status));
    // 細粒度權杖對公開庫一律唯讀，且 permissions 欄位是「使用者」的角色、不是權杖的權限；
    // 私人庫只有在權杖被明確授權時才會出現，所以只看私人庫
    const repos = (await res.json()).filter(r => r.private === true && r.permissions && r.permissions.push);
    if (repos.length === 0) throw new Error('這個權杖沒有授權任何私人儲存庫。請建立一個私人庫，並在權杖的 Repository access 選它，Contents 設為 Read and write。');
    if (repos.length > 1) {
        const names = repos.slice(0, 5).map(r => r.full_name).join('、');
        throw new Error(`這個權杖授權了 ${repos.length} 個儲存庫（${names}${repos.length > 5 ? '…' : ''}）。請重新建立只選「一個」儲存庫的權杖。`);
    }
    return repos[0];
}

async function ghSaveSettings() {
    const token = document.getElementById('ghToken').value.trim();
    const auto = document.getElementById('ghAuto').checked;
    if (!token) {
        // 欄位留白：已經有儲存的權杖就只更新「自動備份」開關，不用再貼一次
        const saved = ghLoad();
        if (saved.token) {
            saved.auto = auto;
            if (!ghStoreCfg(saved)) { showMsg('儲存失敗', '無法寫入瀏覽器儲存空間。'); return; }
            ghRenderSettings();
            ghSetStatus(true, '設定已更新');
            showMsg('設定已更新', auto ? '之後資料有變動會自動備份。' : '已關閉自動備份，可按「立即備份」手動備份。');
            return;
        }
        showMsg('設定不完整', '請輸入權杖');
        return;
    }

    let repo;
    try {
        repo = await ghDiscoverRepo(token);
    } catch (e) {
        const text = e instanceof TypeError ? '無法連到 GitHub，請確認網路後再試。' : e.message;
        showMsg('驗證失敗', text);
        return;
    }

    if (repo.private === false) {
        const go = await showConfirm('公開儲存庫', `「${repo.full_name}」是「公開」儲存庫，你的漫畫清單任何人都看得到。\n\n建議改用私人儲存庫。仍要使用嗎？`, { danger: true, okText: '仍要使用' });
        if (!go) return;
    }

    const cfg = {
        token,
        repo: repo.full_name,
        branch: repo.default_branch || 'main',
        path: 'mangaki_backup.json',
        auto
    };
    if (ghCfgError(cfg)) { showMsg('設定錯誤', ghCfgError(cfg)); return; }
    if (!ghStoreCfg(cfg)) { showMsg('儲存失敗', '無法寫入瀏覽器儲存空間。'); return; }
    ghRenderSettings();
    ghSetStatus(true, '設定已儲存');
    showMsg('設定已儲存', `將備份到 ${cfg.repo}。` + (auto ? '之後資料有變動會自動備份。' : '尚未開啟自動備份，可按「立即備份」手動備份。'));
}

async function ghClearSettings() {
    if (!(await showConfirm('清除設定', '確定要清除權杖與 GitHub 備份設定嗎？\n\n（不會刪除 GitHub 上已有的備份）', { danger: true, okText: '清除' }))) return;
    clearTimeout(ghTimer);
    ghTimer = null;
    try { localStorage.removeItem(GH_KEY); localStorage.removeItem(GH_STATUS_KEY); } catch (e) {}
    ghRenderSettings();
    showMsg('已清除', '權杖與設定已從這支手機移除。');
}

// 資料變動後排程自動備份（saveComics 會呼叫）
function ghScheduleAuto() {
    const cfg = ghLoad();
    if (!cfg.auto || ghCfgError(cfg)) return;
    clearTimeout(ghTimer);
    ghTimer = setTimeout(() => { ghTimer = null; ghBackupNow(false); }, GH_DELAY_MS);
}

async function ghBackupNow(manual) {
    const cfg = ghLoad();
    const err = ghCfgError(cfg);
    if (err) { if (manual) showMsg('尚未設定', err + '，請先儲存設定。'); return; }
    if (!Array.isArray(comics) || comics.length === 0) {
        ghSetStatus(false, '目前沒有漫畫資料，已略過備份（避免覆蓋雲端備份）');
        if (manual) showMsg('沒有資料', '目前沒有漫畫資料可以備份。');
        return;
    }
    if (ghBusy) { ghPending = true; return; }
    ghBusy = true;
    clearTimeout(ghTimer);
    ghTimer = null;

    try {
        const content = JSON.stringify({
            app: 'MANGAKI 漫記',
            version: 1,
            count: comics.length,
            comics: comics
        }, null, 2);

        // 取得現有檔案的 sha（更新檔案需要）
        const getRes = await fetch(`${ghFileUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, { headers: ghHeaders(cfg), cache: 'no-store' });
        let sha;
        if (getRes.ok) {
            const existing = await getRes.json();
            sha = existing.sha;
            if (existing.content && ghFromBase64(existing.content) === content) {
                ghSetStatus(true, '內容沒有變動，不需要備份');
                if (manual) showMsg('已是最新', 'GitHub 上的備份和目前資料一致。');
                return;
            }
        } else if (getRes.status !== 404) {
            throw new Error(ghErrorText(getRes.status));
        }

        const putRes = await fetch(ghFileUrl(cfg), {
            method: 'PUT',
            headers: ghHeaders(cfg, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                message: `MANGAKI backup (${comics.length})`,
                content: ghToBase64(content),
                branch: cfg.branch,
                sha: sha
            })
        });
        if (!putRes.ok) throw new Error(ghErrorText(putRes.status));

        ghSetStatus(true, `已備份 ${comics.length} 部漫畫`);
        if (manual) showMsg('備份成功', `已備份 ${comics.length} 部漫畫到 GitHub。`);
    } catch (error) {
        console.error('MANGAKI GitHub 備份失敗：', error);
        const text = error instanceof TypeError ? '無法連到 GitHub（可能沒有網路）' : error.message;
        ghSetStatus(false, text);
        if (manual) showMsg('備份失敗', text);
    } finally {
        ghBusy = false;
        if (ghPending) { ghPending = false; ghScheduleAuto(); }
    }
}

async function ghRestore() {
    const cfg = ghLoad();
    const err = ghCfgError(cfg);
    if (err) { showMsg('尚未設定', err + '，請先儲存設定。'); return; }
    try {
        // 先找目前的檔名；改名前建立的備份檔叫 toptoon_backup.json，找不到時再試它
        const paths = [cfg.path];
        if (cfg.path === 'mangaki_backup.json') paths.push('toptoon_backup.json');
        let res = null;
        for (const path of paths) {
            res = await fetch(`${ghFileUrl(Object.assign({}, cfg, { path }))}?ref=${encodeURIComponent(cfg.branch)}`, {
                headers: ghHeaders(cfg, { 'Accept': 'application/vnd.github.raw+json' }),
                cache: 'no-store'
            });
            if (res.ok || res.status !== 404) break;
        }
        if (!res.ok) { showMsg('還原失敗', res.status === 404 ? 'GitHub 上還沒有備份檔。' : ghErrorText(res.status)); return; }
        const text = await res.text();
        // 沿用本機還原流程（含格式驗證與確認視窗）
        const file = new File([text], 'github_backup.json', { type: 'application/json' });
        importData({ target: { files: [file], value: '' } });
    } catch (e) {
        console.error('MANGAKI GitHub 還原失敗：', e);
        showMsg('還原失敗', '無法連到 GitHub，請確認網路後再試。');
    }
}

// 離開畫面（切到背景）時，若有等待中的備份就立刻送出
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && ghTimer) {
        clearTimeout(ghTimer);
        ghTimer = null;
        ghBackupNow(false);
    }
});
