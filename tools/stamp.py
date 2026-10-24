#!/usr/bin/env python3
"""依所有原始檔（index.html、sw.js、manifest.json、css/style.css、js/*.js）的內容產生版本代碼，
寫回 js/update.js 的 APP_BUILD 與 version.json。
每次 commit 前執行；內容沒變時代碼也不變。"""
import hashlib, json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
# 順序固定，版本代碼才穩定（index.html 的 <script> 載入順序也是這個順序）
files = [root / 'index.html', root / 'sw.js', root / 'manifest.json', root / 'css' / 'style.css'] + sorted((root / 'js').glob('*.js'))
holder = root / 'js' / 'update.js'
pattern = re.compile(r"const APP_BUILD = '[^']*';")
if not pattern.search(holder.read_text(encoding='utf-8')):
    sys.exit('找不到 APP_BUILD 常數')

h = hashlib.sha1()
for f in files:
    text = f.read_text(encoding='utf-8')
    if f == holder:
        text = pattern.sub("const APP_BUILD = '';", text)
    h.update(f.name.encode('utf-8') + b'\0' + text.encode('utf-8'))
build = h.hexdigest()[:8]

text = holder.read_text(encoding='utf-8')
holder.write_text(pattern.sub(f"const APP_BUILD = '{build}';", text), encoding='utf-8')
(root / 'version.json').write_text(json.dumps({'build': build}) + '\n', encoding='utf-8')
print('build', build)
