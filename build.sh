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
#    (아래 폴더 안에 새로 만든 파일은 폴더째 복사돼서 자동으로 들어가요. 예: ui/line-connect.js)
#    마지막 단계에서 index.html 이 부르는 파일이 dist/ 에 모두 있는지 검사해서, 빠지면 배포를 멈춰요.
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
#    css/  — 화면 스타일
#    lang/ — 9개 언어 문구
#    legal/ — 법적 문서 본문
#    cnc/  — 주문·관리자·매출 로직
#    ui/   — 화면 (공통 부품 layout.js, line-connect.js, datepicker.js, router.js + 각 페이지)
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

# 4) 검사: index.html 이 부르는 내 파일(src="..." / href="...")이 dist/ 에 모두 있는지
missing=0
for ref in $(grep -oE '(src|href)="[^"#:]+"' index.html | sed -E 's/^(src|href)="//; s/"$//' | grep -vE '^(https?:)?//' | sort -u); do
  if [ ! -f "$OUT/$ref" ]; then
    echo "index.html 이 부르는데 dist/ 에 없는 파일: $ref  → build.sh 목록에 추가하세요" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then exit 1; fi

echo "dist/ 준비 완료:"
find "$OUT" -maxdepth 1 | sort
echo "ui/ 파일:"
ls "$OUT/ui"
