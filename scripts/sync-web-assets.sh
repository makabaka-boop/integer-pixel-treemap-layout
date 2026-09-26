#!/usr/bin/env bash
# 把 Web 构建产物同步进 Compose 应用的 assets，供 TreemapPage 离线加载。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist"
DST="$ROOT/compose/app/src/main/assets/treemap"

if [[ ! -f "$SRC/index.html" ]]; then
  echo "未找到 $SRC/index.html，请先在仓库根目录执行 npm run build" >&2
  exit 1
fi

rm -rf "$DST"
mkdir -p "$DST"
cp -r "$SRC"/. "$DST"/
echo "已同步 $SRC → $DST"
