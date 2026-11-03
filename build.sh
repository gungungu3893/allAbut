#!/usr/bin/env bash
# ================================================================
# allAbut — Cloudflare Pages 배포용 "공개 파일만 골라 담기"
# ================================================================
# Cloudflare Pages 설정 (Settings → Builds & deployments)
#   Build command:          bash build.sh
#   Build output directory: dist
#
# 왜 필요한가요?
#   저장소에는 안내문(*.md), SQL(sql/), 서버 함수 코드(supabase/) 도 있어요.
#   이 스크립트는 "사이트에 필요한 파일만" dist/ 에 복사해요.
#   → dist/ 에 없는 파일은 아예 업로드되지 않아서, 주소로 열면 404 가 나와요.
#
# ⚠️ 새 파일·폴더를 사이트에 추가하면 아래 목록에도 꼭 넣어 주세요 (안 넣으면 사이트에서 404).
set -euo pipefail

OUT=dist
rm -rf "$OUT"
mkdir -p "$OUT"

# 1) 공개 파일 (맨 위 폴더)
FILES=(
  index.html
  404.html
  config.js
  lang.js
  auth.js
  session.js
  app.js
  _headers
  _redirects
)

# 2) 공개 폴더 (통째로)
DIRS=(
  css
  lang
  legal
  cnc
  ui
)

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then echo "빠진 파일: $f" >&2; exit 1; fi
  cp "$f" "$OUT/"
done
for d in "${DIRS[@]}"; do
  if [ ! -d "$d" ]; then echo "빠진 폴더: $d" >&2; exit 1; fi
  cp -R "$d" "$OUT/"
done

# 3) 혹시 공개 폴더 안에 안내문(.md)이 들어가 있으면 지워요
find "$OUT" -name '*.md' -delete

echo "dist/ 준비 완료:"
find "$OUT" -maxdepth 1 | sort
