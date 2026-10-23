#!/usr/bin/env python3
"""依 index.html 的內容產生版本代碼，寫回 index.html 的 APP_BUILD 與 version.json。
每次 commit 前由 .git/hooks/pre-commit 自動執行；內容沒變時代碼也不變。"""
import hashlib, json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
index = root / 'index.html'
text = index.read_text(encoding='utf-8')
pattern = re.compile(r"const APP_BUILD = '[^']*';")
if not pattern.search(text):
    sys.exit('找不到 APP_BUILD 常數')
normalized = pattern.sub("const APP_BUILD = '';", text)
build = hashlib.sha1(normalized.encode('utf-8')).hexdigest()[:8]
index.write_text(pattern.sub(f"const APP_BUILD = '{build}';", text), encoding='utf-8')
(root / 'version.json').write_text(json.dumps({'build': build}) + '\n', encoding='utf-8')
print('build', build)
