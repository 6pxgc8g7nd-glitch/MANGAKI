// 資料備份：匯出、匯入還原、備份檔驗證

// 產生備份檔案名稱
function getBackupFileName() {
    return 'mangaki_backup.json';
}


function downloadBackup(blob) {
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = (blob && blob.name) || getBackupFileName();
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

// 複製備份 JSON 到剪貼簿（下載/分享都不能用時的備援）
function copyBackupText() {
    if (!Array.isArray(comics) || comics.length === 0) {
showMsg('沒有資料', '目前沒有漫畫資料可以匯出。');
return;
    }
    const text = JSON.stringify({
app: 'MANGAKI 漫記',
version: 1,
exportTime: new Date().toISOString(),
count: comics.length,
comics: comics
    }, null, 2);

    const fail = () => showMsg('複製失敗', '瀏覽器不允許寫入剪貼簿，請改用「匯出備份」。');
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
fail();
return;
    }
    navigator.clipboard.writeText(text)
.then(() => showMsg('已複製', '備份內容已複製，請貼到備忘錄並存成 .json 檔。'))
.catch(fail);
}

// 匯出資料
function exportData() {

    if (!Array.isArray(comics)) {
showMsg(
    '匯出失敗',
    '目前漫畫資料格式異常，無法進行備份。'
);
return;
    }

    if (comics.length === 0) {
showMsg(
    '沒有資料',
    '目前沒有漫畫資料可以匯出。'
);
return;
    }

    try {

const backupData = {
    app: 'MANGAKI 漫記',
    version: 1,
    exportTime: new Date().toISOString(),
    count: comics.length,
    comics: comics
};

const jsonData = JSON.stringify(
    backupData,
    null,
    2
);

const blob = new Blob(
    [jsonData],
    {
        type: 'application/json;charset=utf-8'
    }
);

const count = comics.length;
const file = new File([blob], getBackupFileName(), { type: 'application/json' });

// iOS 主畫面 App 不支援 <a download>，優先用系統分享表單（可存到「檔案」）
if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] })
        .then(() => showMsg('匯出成功', `已成功備份 ${count} 部漫畫資料。`))
        .catch(err => {
            if (err && err.name === 'AbortError') return; // 使用者取消
            console.error('MANGAKI 分享失敗，改用下載：', err);
            downloadBackup(blob);
            showMsg('匯出完成', '若沒有收到檔案，請改用「複製備份文字」。');
        });
    return;
}

downloadBackup(blob);
showMsg(
    '匯出完成',
    `已備份 ${count} 部漫畫資料。若沒有收到檔案，請改用「複製備份文字」。`
);

    } catch (error) {

console.error(
    'MANGAKI 匯出錯誤：',
    error
);

showMsg(
    '匯出失敗',
    '建立備份檔案時發生錯誤，請稍後再試。'
);
    }
}


// 驗證單筆漫畫資料
function validateComic(comic) {

    if (!comic || typeof comic !== 'object') {
return false;
    }

    if (
typeof comic.id !== 'string' ||
typeof comic.title !== 'string' ||
typeof comic.genre !== 'string'
    ) {
return false;
    }

    if (
comic.status !== undefined &&
typeof comic.status !== 'string'
    ) {
return false;
    }

    if (
comic.url !== undefined &&
typeof comic.url !== 'string'
    ) {
return false;
    }

    if (
comic.links !== undefined &&
(!Array.isArray(comic.links) || comic.links.some(l => !l || typeof l !== 'object' || (l.url !== undefined && typeof l.url !== 'string') || (l.label !== undefined && typeof l.label !== 'string')))
    ) {
return false;
    }

    if (
comic.coverUrl !== undefined &&
typeof comic.coverUrl !== 'string'
    ) {
return false;
    }

    if (
comic.progress !== undefined &&
typeof comic.progress !== 'number'
    ) {
return false;
    }

    return true;
}


// 匯入資料
function importData(e) {

    const file = e.target.files[0];

    if (!file) {
return;
    }

    // 檢查副檔名
    if (
!file.name.toLowerCase().endsWith('.json')
    ) {

showMsg(
    '格式錯誤',
    '請選擇 JSON 備份檔案。'
);

e.target.value = '';
return;
    }

    const reader = new FileReader();

    reader.onload = async function(event) {

try {

    const parsedData =
        JSON.parse(event.target.result);

    let importedComics = null;

    // 新版備份格式
    if (
        parsedData &&
        !Array.isArray(parsedData) &&
        Array.isArray(parsedData.comics)
    ) {

        importedComics =
            parsedData.comics;

    }

    // 相容舊版直接匯出的陣列格式
    else if (
        Array.isArray(parsedData)
    ) {

        importedComics =
            parsedData;

    }

    else {

        showMsg(
            '格式錯誤',
            '這不是有效的 MANGAKI 漫畫備份檔。'
        );

        e.target.value = '';
        return;
    }


    // 檢查每一筆漫畫
    const invalidIndex =
        importedComics.findIndex(
            comic => !validateComic(comic)
        );

    if (invalidIndex !== -1) {

        showMsg(
            '資料錯誤',
            `備份檔第 ${invalidIndex + 1} 筆漫畫資料格式不正確。`
        );

        e.target.value = '';
        return;
    }


    // 防止空資料意外覆蓋
    if (importedComics.length === 0) {

        showMsg(
            '沒有漫畫資料',
            '這個備份檔案沒有任何漫畫紀錄。'
        );

        e.target.value = '';
        return;
    }


    // 確認匯入
    const shouldImport = await showConfirm(
        '還原備份',
        `確定要還原 ${importedComics.length} 部漫畫嗎？\n\n` +
        `目前資料：${comics.length} 部\n` +
        `備份資料：${importedComics.length} 部\n\n` +
        `還原後會取代目前的漫畫資料。`,
        { okText: '還原' }
    );

    if (!shouldImport) {

        e.target.value = '';
        return;
    }


    // 建立新的陣列，避免直接引用 JSON
    comics =
        importedComics.map(comic => ({
            id: String(comic.id),
            title: String(comic.title).trim(),
            genre: String(comic.genre).trim(),
            status: comic.status || '連載中',
            links: getLinks(comic),
            url: latestUrl(getLinks(comic)),
            coverUrl: safeUrl(comic.coverUrl),
            progress: parseProgress(comic.progress)
        }));


    saveComics();
    comics.forEach(c => unmarkTitleDeleted(c.title));   // 還原回來的漫畫，不再算「刪除過」

    // 重置分類
    activeGenreFilter = [];
    currentPage = 1;

    // 更新畫面
    renderComics();
    renderCategories();
    

    // 清除 file input
    e.target.value = '';

    showMsg(
        '還原成功',
        `已成功還原 ${comics.length} 部漫畫紀錄。`
    );

} catch (error) {

    console.error(
        'MANGAKI 匯入錯誤：',
        error
    );

    showMsg(
        '讀取失敗',
        '無法解析這個 JSON 備份檔案，請確認檔案沒有損壞。'
    );

    e.target.value = '';
}
    };


    reader.onerror = function() {

showMsg(
    '讀取失敗',
    '無法讀取備份檔案。'
);

e.target.value = '';
    };


    reader.readAsText(
file,
'UTF-8'
    );
}
