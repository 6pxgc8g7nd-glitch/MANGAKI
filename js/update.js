// App 更新：版本檢查、清除快取、Service Worker

// ================================
// App 更新（自動 / 手動檢查 / 清除快取）
// ================================
const AUTO_UPDATE_KEY = 'mangaki_auto_update';
// 這份程式碼自己的版本代碼；每次 commit 前由 tools/stamp.py 依內容自動更新，
// 並寫進 version.json。比對「正在執行的程式」與「伺服器最新版」就能發現舊版。
const APP_BUILD = 'a4d77378';
const RELOAD_TRY_KEY = 'mangaki_reload_try';
let updateReloading = false;

function autoUpdateEnabled() {
    try { return localStorage.getItem(AUTO_UPDATE_KEY) !== '0'; } catch (e) { return true; }
}

function setAutoUpdate(on) {
    try { localStorage.setItem(AUTO_UPDATE_KEY, on ? '1' : '0'); } catch (e) {}
}

function isTyping() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

// 伺服器上的最新版本代碼（不經過任何快取）
async function latestBuild() {
    const res = await fetch('version.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('version.json ' + res.status);
    const data = await res.json();
    return String(data.build);
}

function renderUpdateInfo() {
    const v = document.getElementById('updateVersion');
    if (v) v.innerText = `版本 ${APP_BUILD}`;
    const t = document.getElementById('autoUpdateToggle');
    if (t) t.checked = autoUpdateEnabled();
}

async function clearAppCaches() {
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
    } catch (e) { console.error('MANGAKI 清除快取失敗：', e); }
}

// 自動檢查：開啟時、回到 App、每 30 分鐘。偵測到舊版就重新載入；
// 重新載入仍是舊版（被快取卡住）時，第二次起會清除快取再載入，最多嘗試 3 次避免無限重載。
async function checkForUpdateAuto() {
    try {
        if (updateReloading || isTyping() || !autoUpdateEnabled()) return;
        const latest = await latestBuild();
        if (latest === APP_BUILD) { sessionStorage.removeItem(RELOAD_TRY_KEY); return; }
        const tries = Number(sessionStorage.getItem(RELOAD_TRY_KEY) || 0);
        if (tries >= 3) return;
        sessionStorage.setItem(RELOAD_TRY_KEY, String(tries + 1));
        updateReloading = true;
        if (tries >= 1) {
            await clearAppCaches();
            location.replace(location.pathname + '?r=' + Date.now());
        } else {
            location.reload();
        }
    } catch (e) {}
}

async function manualCheckUpdate() {
    try {
        const latest = await latestBuild();
        if (latest === APP_BUILD) {
            showMsg('已是最新版本', `目前版本代碼：${APP_BUILD}`);
            return;
        }
        const go = await showConfirm('有新版本', `發現新版本（${latest}）。\n\n要現在更新嗎？漫畫資料不會被刪除。`, { okText: '立即更新' });
        if (!go) return;
        updateReloading = true;
        await clearAppCaches();
        location.replace(location.pathname + '?r=' + Date.now());
    } catch (e) {
        console.error('MANGAKI 檢查更新失敗：', e);
        showMsg('檢查失敗', '無法連線取得最新版本，請確認網路後再試。');
    }
}

// 清除快取並重新載入（漫畫資料與設定都在 localStorage，不會被清除）
async function forceRefreshApp() {
    const go = await showConfirm('清除快取並重新載入', '會清除 App 的程式快取並重新下載最新版。\n\n漫畫資料與設定不會被刪除。', { okText: '重新載入' });
    if (!go) return;
    updateReloading = true;
    await clearAppCaches();
    location.replace(location.pathname + '?r=' + Date.now());
}

renderUpdateInfo();
checkForUpdateAuto();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdateAuto();
});
setInterval(checkForUpdateAuto, 30 * 60 * 1000);

// 註冊 service worker：sw.js 本身有變動時也自動重新載入
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 第一次安裝不用重新載入；正在輸入或關閉自動更新時不動作
        if (!hadController || updateReloading || isTyping() || !autoUpdateEnabled()) return;
        updateReloading = true;
        location.reload();
    });

    navigator.serviceWorker.register('sw.js').then(reg => {
        const check = () => reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check();
        });
        setInterval(check, 30 * 60 * 1000);
    }).catch(err => console.error('MANGAKI service worker 註冊失敗：', err));
}
