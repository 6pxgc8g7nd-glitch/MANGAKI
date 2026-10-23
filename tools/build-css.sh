#!/bin/sh
# 重新編譯 tailwind.css（新增或修改 Tailwind 類別後要執行；編好的檔案要一起 commit）
cd "$(dirname "$0")/.." && npx --yes tailwindcss@3.4.17 -c tools/tailwind.config.js -i tools/tailwind.input.css -o tailwind.css --minify
