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
#   (sql/launch_reset.sql · LAUNCH_CHECKLIST.md 같은 정식 오픈용 파일도 여기 포함 — 절대 공개 폴더에 안 들어가요)
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
  loader.js         # 필요할 때 불러오기 (언어 파일 · 관리자 화면 파일 STAFF_SCRIPTS)
  lang.js
  auth.js
  session.js
  app.js
  _headers
  _redirects
  favicon.ico       # 사이트 맨 위 /favicon.ico (검색엔진 · 오래된 브라우저가 찾는 곳 — assets/brand/favicon.ico 와 같은 파일)
  robots.txt        # 검색 로봇 안내 (전체 허용 + 사이트맵 주소)
  sitemap.xml       # 사이트맵 (맨 위 주소 하나 — # 주소는 따로 색인되지 않아요)
  site.webmanifest  # 홈 화면에 추가할 때 이름 · 아이콘 · 색
)

# 2) 공개 폴더 (통째로)
#    css/  — 화면 스타일
#    lang/ — 9개 언어 문구
#    legal/ — 법적 문서 본문
#    cnc/  — 주문·관리자·매출 로직 (영업 · 커미션 cnc/cnc-sales.js, 서비스 상태 cnc/cnc-service.js, 광고 배너 cnc/cnc-ads.js, 주문 파일 보관 기간 cnc/cnc-retention.js, 세금계산서 · 영수증 cnc/cnc-tax.js, 직원 계정 · 초대 · 영업 화면 데이터 cnc/cnc-staff.js 포함)
#    assets/ — 공개 이미지 (assets/brand/line-icon.png = LINE 알림 카드 맨 위 로고, line-notify 가 SITE_URL 로 불러요 /
#              파비콘 favicon.svg · favicon.ico · favicon-48/96/192/512.png · apple-touch-icon.png · 공유 이미지 og-image.png — tools/brand/make_brand_assets.py 로 만들어요)
#    ui/   — 화면 (공통 부품 layout.js, line-connect.js, datepicker.js, back-to-top.js(맨 위로 버튼), router.js + 각 페이지, 회사소개 page-about.js, 영업 · 커미션 page-admin-sales.js,
#            TEST 배지 service-badge.js, 광고 배너 자리 ad-banner.js · 관리 page-admin-ads.js, 주문 파일 보관 기간 카드 page-admin-retention.js,
#            세금계산서 A4 출력 tax-doc.js · 내 정보 문서 섹션 profile-docs.js · 관리자 세금계산서 탭 page-admin-tax.js,
#            직원 초대 가입 page-join.js · 영업 화면(내 거래처 · 주문 · 입금 · 월별 매출) page-sales.js · 대표 직원 메뉴 page-admin-staff.js)
#    (회사소개 제품 사진을 img/ 같은 새 폴더에 넣으면 아래 DIRS 에도 추가하세요)
DIRS=(
  css
  assets
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

# 3-1) 캐시 깨기: 배포마다 바뀌는 버전 값(커밋 해시)을 index.html 의 내 js · css 주소 뒤에 ?v= 로 붙여요
#      → 브라우저가 예전 파일을 캐시에서 꺼내 쓰지 않아요 (Ctrl+Shift+R 없이 새 화면).
#      Cloudflare Pages 는 CF_PAGES_COMMIT_SHA 를 줘요. 없으면 git 해시 → 그것도 없으면 빌드 시각.
#      _headers: index.html 은 no-cache, ?v= 가 붙는 js · css 는 길게 캐시.
#      필요할 때 불러오는 파일(지금 언어 lang/*.js · 관리자 화면 · 법적 문서 legal/*.js)은 loader.js 의 cncAssetQuery() 가 <meta name="asset-version"> 값으로 같은 ?v= 를 붙여요.
VER="${CF_PAGES_COMMIT_SHA:-}"
if [ -z "$VER" ]; then VER="$(git rev-parse --short=8 HEAD 2>/dev/null || true)"; fi
if [ -z "$VER" ]; then VER="$(date -u +%Y%m%d%H%M%S)"; fi
VER="${VER:0:12}"
sed -E -i \
  -e "s#((src|href)=\")([^\":?]+\.(js|css))(\")#\1\3?v=${VER}\5#g" \
  -e "s#(<meta name=\"asset-version\" content=\")dev(\")#\1${VER}\2#" \
  "$OUT/index.html"
echo "버전 값: ${VER}"

# 3-2) 검색 · 공유용 절대 주소: __SITE_URL__ 자리를 config.js 의 SITE_URL 로 채워요 (사이트 주소는 config.js 한 곳에서만)
#      index.html (canonical · og:url · og:image · JSON-LD) · robots.txt (Sitemap) · sitemap.xml
SITE_URL="$(sed -nE "s/^[[:space:]]*var SITE_URL = '([^']+)'.*/\1/p" config.js | head -1)"
SITE_URL="${SITE_URL%/}"
if [ -z "$SITE_URL" ]; then echo "config.js 에서 SITE_URL 을 못 읽었어요" >&2; exit 1; fi
for f in index.html robots.txt sitemap.xml; do
  sed -i "s#__SITE_URL__#${SITE_URL}#g" "$OUT/$f"
done
if grep -l "__SITE_URL__" "$OUT/index.html" "$OUT/robots.txt" "$OUT/sitemap.xml" >/dev/null 2>&1; then
  echo "__SITE_URL__ 이 남아 있어요" >&2; exit 1
fi
echo "사이트 주소: ${SITE_URL}"

# 4) 검사: index.html 이 부르는 내 파일(src="..." / href="...")이 dist/ 에 모두 있는지
missing=0
for ref in $(grep -oE '(src|href)="[^"#:?]+"' index.html | sed -E 's/^(src|href)="//; s/"$//' | grep -vE '^(https?:)?//' | grep -v '__SITE_URL__' | sort -u); do
  if [ ! -f "$OUT/$ref" ]; then
    echo "index.html 이 부르는데 dist/ 에 없는 파일: $ref  → build.sh 목록에 추가하세요" >&2
    missing=1
  fi
done
# 공유 이미지 · 사이트맵 · 매니페스트 아이콘도 있는지
for ref in assets/brand/og-image.png assets/brand/favicon-512.png assets/brand/favicon-192.png favicon.ico robots.txt sitemap.xml site.webmanifest; do
  if [ ! -f "$OUT/$ref" ]; then echo "dist/ 에 없는 파일: $ref" >&2; missing=1; fi
done
# 필요할 때 불러오는 파일도 있는지
#   - 관리자 · 영업 화면: loader.js 의 STAFF_SCRIPTS 목록 ('…' 안의 .js)
#   - 언어 파일: lang.js 의 LANGUAGES 목록 (code: 'xx') → lang/lang-xx.js
staff_list="$(sed -n '/^var STAFF_SCRIPTS = \[/,/^\];/p' loader.js | grep -oE "'[^']+\.js'" | tr -d "'" || true)"
if [ -z "$staff_list" ]; then echo "loader.js 에서 STAFF_SCRIPTS 목록을 못 읽었어요" >&2; missing=1; fi
for ref in $staff_list; do
  if [ ! -f "$OUT/$ref" ]; then echo "loader.js(STAFF_SCRIPTS)가 부르는데 dist/ 에 없는 파일: $ref" >&2; missing=1; fi
done
lang_list="$(sed -n '/^var LANGUAGES = \[/,/^\];/p' lang.js | grep -oE "code: '[a-z]+'" | sed -E "s/code: '([a-z]+)'/\1/" || true)"
if [ -z "$lang_list" ]; then echo "lang.js 에서 LANGUAGES 목록을 못 읽었어요" >&2; missing=1; fi
for code in $lang_list; do
  if [ ! -f "$OUT/lang/lang-$code.js" ]; then echo "lang.js(LANGUAGES)가 부르는데 dist/ 에 없는 파일: lang/lang-$code.js" >&2; missing=1; fi
done
echo "필요할 때 불러오는 파일: 관리자 화면 $(echo "$staff_list" | wc -w)개 · 언어 $(echo "$lang_list" | wc -w)개 — 모두 있어요"
if [ "$missing" -ne 0 ]; then exit 1; fi

echo "dist/ 준비 완료:"
find "$OUT" -maxdepth 1 | sort
echo "ui/ 파일:"
ls "$OUT/ui"
