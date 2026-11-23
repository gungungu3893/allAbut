# CLAUDE.md

## 브랜치
- 브랜치명: `main`

## Git Rules
- 작업 후 항상 아래 명령을 실행한다:
  ```bash
  git add . && git commit -m "메시지" && git push origin main
  ```
- 커밋하기 전에 항상 `node tools/check.js` 를 돌린다. 실패가 있으면 고친 뒤에 올린다.
- 새 SQL 함수 · 새 오류 코드 · 새 번역 키 · 새 디자인 파일을 만들면 이 검사가 같이 확인한다. 허용 목록에 넣을 때는 이유를 적는다.
  - 검사 8가지: 문법 · 번역 9개 언어 · DB 함수 이름과 p_ 인자 · 오류 안내 · 빌드 · 디자인 스위치 범위 · 브랜드 규칙(CNC · <5μm) · 비밀값. 빌드를 빼고 빠르게: `node tools/check.js --no-build`
  - 허용 목록은 `tools/check.js` 맨 위 `ALLOW` 한 곳에만 (항목마다 이유). `tools/` 는 배포되지 않아요

## 배포 · 도메인
- 사이트 주소: **https://allabut.com** (www.allabut.com 도 연결 — www → allabut.com 301 은 Cloudflare 대시보드 Redirect Rules 에서)
- 호스팅: **Cloudflare Pages** (프로젝트 `allabut`), `main` 브랜치에 push 하면 자동 배포
  - Build command: `bash build.sh` / Build output directory: `dist`
  - `build.sh` 가 공개 파일만 `dist/` 에 복사 → `*.md`, `sql/`, `supabase/` 는 배포되지 않아 404
  - **사이트에 새 파일·폴더를 추가하면 `build.sh` 목록에도 추가** (안 하면 사이트에서 404)
  - `404.html` 은 지우지 않는다 (없으면 Cloudflare 가 없는 주소에 index.html 을 200 으로 보여줌)
  - `_redirects` (빌드 설정을 깜빡했을 때 문서 주소 → 404 페이지 안전장치 — *.md 전부 · build.sh · /sql/* · /supabase/* · /tools/* · /docs/*. **새 안내문 · 폴더를 만들면 여기에도**), `_headers` (기본 보안 헤더 + 캐시)
  - **보안 헤더** (`_headers` 의 `/*`): X-Content-Type-Options · Referrer-Policy · X-Frame-Options DENY · **Strict-Transport-Security max-age=31536000** · **Permissions-Policy camera=(), microphone=(), geolocation=()** ·
    **Content-Security-Policy-Report-Only** (허용: 우리 사이트 · `*.supabase.co`(https · wss) · challenges.cloudflare.com(Turnstile) · fonts.googleapis.com · fonts.gstatic.com · cdn.jsdelivr.net · cdnjs.cloudflare.com,
    이미지는 광고 배너 때문에 https: 전체, onclick 속성 때문에 'unsafe-inline'). **지금은 Report-Only = 막지 않고 콘솔에 경고만** → 한동안 경고가 없으면 이름을 `Content-Security-Policy` 로 바꿔 실제로 막기.
    새 외부 주소(CDN · API)를 쓰면 이 목록에도 추가
  - **supabase-js 무결성 검사(SRI)**: index.html 의 `<script … supabase.js integrity="sha384-…" crossorigin="anonymous">`. 값 = npm 패키지 `@supabase/supabase-js@2.45.4` 의 `dist/umd/supabase.js` 의 sha384
    (`openssl dgst -sha384 -binary supabase.js | openssl base64 -A`). **버전을 바꾸면 이 값도 새로** (안 바꾸면 브라우저가 스크립트를 막아 사이트가 안 열려요)
  - **캐시 깨기**: `build.sh` 가 `dist/index.html` 의 내 js · css 주소 뒤에 `?v=버전`(Cloudflare `CF_PAGES_COMMIT_SHA` 앞 12자 → 없으면 git 해시 → 빌드 시각)을 붙이고
    `<meta name="asset-version" content="dev">` 도 같은 값으로 바꿔요. 동적으로 불러오는 파일(지금 언어 · 관리자 화면 · 법적 문서 `legal/*.js`)은 `cncAssetQuery()`(loader.js)가 같은 `?v=` 를 붙여요.
    `_headers`: `/` · `/index.html` = `no-cache`, 맨 위 js 7개(loader.js · theme.js 포함) · `/css/*` · `/lang/*` · `/legal/*` · `/cnc/*` · `/ui/*` = 1년 `immutable` (주소가 배포마다 바뀌어서 안전).
    → 배포 뒤 Ctrl+Shift+R 없이 새 화면. **index.html 에 새 js · css 를 넣으면 상대 경로(`src="ui/…"`)로** (자동으로 ?v= 가 붙어요), 새로 동적으로 불러오는 내 파일이 생기면 그 주소에도 `cncAssetQuery()`
- **첫 접속을 가볍게 — 필요할 때 불러오기** (`loader.js`):
  - index.html 은 모든 사람이 쓰는 파일만 (스크립트 47개 = 내 파일 46(theme.js · ui/landing-mono.js · ui/landing-navy.js 포함) + supabase-js, 예전 65개). **관리자 · 영업 · 세금계산서 화면 파일과 영어가 아닌 언어 파일은 index.html 에 넣지 않는다**
  - 언어: index.html 에는 `lang/lang-en.js`(대체용)만. `lang.js` 가 끝에서 `cncLoadLang(currentLang)` 으로 지금 언어를 바로 받기 시작 → boot · 로그인 후 프로필 언어는 `cncLoadLangWithin(code)`(최대 4초 `LANG_WAIT_MS`) 로 기다려요.
    `setLang(code)` = 파일이 있으면 바로, 없으면 받은 뒤에 바꾸고 `langchange` (기다리는 사이 다른 언어를 고르면 마지막 것). 못 받으면 영어로 보여 주고 조용히 다시 시도(3초 · 10초 · 30초 · 60초…, 최대 10번) → 도착하면 다시 그려요(`langArrived`).
    `currentLang` 을 직접 바꾸지 말고 `setLang` 을 쓰거나, 꼭 직접 바꿔야 하면 먼저 `cncLoadLangWithin`. 다른 언어 문구를 미리 읽어야 하는 코드는 `cncLoadLang(code)` 를 기다린 뒤에
  - 관리자 화면: `STAFF_SCRIPTS`(loader.js — cnc-admin · cnc-finance · cnc-sales · page-admin(+ 탭 파일 전부) · page-sales · page-admin-staff, **순서 그대로**)는 관리 팀 · 영업 담당만 받아요.
    `cncApplyAdminMe` 가 역할을 보면 `cncLoadStaffScripts()` 시작(한꺼번에 preload, 실행은 목록 순서대로 하나씩, 실패하면 그 파일부터 다시) → `enterApp` 은 최대 8초 기다려요.
    router 는 `#/admin` 인데 아직 없으면 "불러오는 중"(`renderStaffLoading`) → 받으면 같은 주소를 다시 그려요(LINE `#/admin/orders?order=` 그대로). 못 받으면 `err_network` + 5초 뒤 조용히 다시
  - **새 관리자 · 영업 화면 파일은 `STAFF_SCRIPTS` 에** (index.html 아님). **고객 화면 · 로그인 · 직원 초대 가입이 쓰는 함수는 그 파일들에 두지 않는다** —
    그래서 `cncParseJson` · `cncCsvCell` 은 cnc-core.js, `cncCheckAdmin` · 영업 에러 코드(COMMISSION_LOCKED · NOT_SALES …)는 cnc-team.js, `cncAssetQuery` 는 loader.js 에 있어요
  - `build.sh` 검사: index.html 이 부르는 파일 + `STAFF_SCRIPTS` 목록 + `LANGUAGES` 의 `lang/lang-xx.js` 가 dist/ 에 모두 있는지 (빠지면 배포 멈춤)
- **검색 · 링크 공유 (SEO)** — 파비콘 · 공유 이미지 · 구조화 데이터 · robots.txt · 사이트맵:
  - 파비콘 = **전체 워드마크 "allAbut 5μm"** (네이비 #001D4A 정사각형 · 모서리 14% 둥글게, all/but 흰색 · A 골드 굵게 · 5μm 골드 위첨자, 사이트 로고와 같은 비율, 워드마크 폭 88% · 세로 가운데). 큰 A 하나만 쓰는 버전은 만들지 않는다
    (`assets/brand/line-icon.png` = LINE 카드용 A 아이콘은 따로 그대로)
    - 파일: `assets/brand/favicon.svg`(글자를 선(path)으로 — 글꼴 없이도 같게) · `favicon.ico`(16 · 32 · 48) · `favicon-48/96/192/512.png` · `apple-touch-icon.png`(180, 투명 배경 없음 · 모서리 없음) · `og-image.png`(1200×630) + 사이트 맨 위 `favicon.ico`(같은 파일)
    - 작은 크기는 획을 굵게: 16px = all/but 600 · 32px = 500 · 48px = 400 (A 700), **5μm 은 48px 부터** / 96px = 300 · 600 / 180px 이상 = 사이트와 같은 200 · 600. favicon.svg 는 탭(16~32px)용으로 400 · 700 + 5μm
    - **다시 만들기**: `pip install fonttools` → `python3 tools/brand/make_brand_assets.py` (IBM Plex 글꼴을 `tools/brand/.fonts/` 에 받아 글자를 선으로 → `tools/brand/render.js`(Playwright)가 PNG · ICO · 공유 이미지 · `docs/favicon-preview.png`(16 · 32 · 48 · 192px 나란히 + 확대 — 사이트에 안 올라감)).
      `tools/` 는 배포되지 않아요, `.fonts` · `.build` 는 git 에서 빼요
  - `index.html` head: title "allAbut 5μm — CNC Custom Abutments" · description(사실 설명만 — **광고 허가가 필요한 인증 · 성능 주장은 넣지 않는다**) · canonical · theme-color #001D4A ·
    `rel="icon"`(svg + png 48 · 96 · 192) · `rel="apple-touch-icon"` · `rel="manifest"`(`site.webmanifest`: name "allAbut 5μm", short_name "allAbut", 아이콘 192 · 512) ·
    og:title/description/url/locale(en_US + th_TH · ko_KR)/image(+ width · height · alt) · twitter:card summary_large_image · twitter:image
    + **항상 들어가는 JSON-LD** `@graph` = Organization(`@id` `{SITE_URL}/#organization`, name · alternateName · url · logo = favicon-512.png) + WebSite(name "allAbut", alternateName "allAbut 5μm", url, publisher).
    정적 JSON-LD 에는 바뀌지 않는 것만 (회사 연락처 · 주소 등은 회사소개를 열 때 `ui/page-about.js` 가 **같은 @id** 로 더해요, sameAs 는 값이 있을 때만)
    + `<noscript>` 짧은 영어 소개 + 주요 링크 (스크립트를 못 읽는 로봇용). `404.html` 도 파비콘 · theme-color (주소는 `/assets/…` 로 시작 — 어느 주소에서 열려도)
  - **절대 주소는 하드코딩하지 않는다**: index.html · robots.txt · sitemap.xml 의 `__SITE_URL__` 자리를 `build.sh` 가 config.js 의 `SITE_URL` 로 채워요 (남아 있으면 빌드 실패).
    **파비콘 · 공유 이미지 주소에는 `?v=` 를 붙이지 않는다** (구글: 파비콘 주소가 바뀌지 않아야 — build.sh 의 ?v= 는 .js · .css 에만). 그래서 `_headers` 는 `/favicon.ico` · `/assets/brand/*` · `/site.webmanifest` = 하루 캐시(immutable 아님), robots · sitemap = 1시간
  - `robots.txt` = 전체 허용 + Sitemap 주소 / `sitemap.xml` = 사이트 맨 위 주소 하나 (화면은 전부 # 주소라 검색엔진이 따로 색인하지 않아요)
- GitHub Pages(gungungu3893.github.io/allAbut)는 **더 이상 사용하지 않는다**
- 사이트 주소는 하드코딩 금지:
  - 브라우저: `config.js` 의 `SITE_URL` 하나만 사용 (예: 회원가입 인증 메일 링크 `emailRedirectTo`)
  - Edge Function(line-notify, line-webhook): `Deno.env.get('SITE_URL')` 가 있으면 그것, 없으면 `'https://allabut.com'`
- Supabase → Authentication → URL Configuration: Site URL `https://allabut.com`, Redirect URLs 에 `https://allabut.com/**`, `https://www.allabut.com/**`

## 프로젝트
- **allAbut** — CNC 커스텀 어버트먼트를 **쉽고 정확하게 주문하는 전문 웹앱**
- 메타버스/게임 요소는 전부 폐기했다 (Phaser, 아바타, 펫, 이름표, 길드 코드 없음)
- 주문 흐름은 Dentalk CNC 주문 방식을 바탕으로 새로 정리했다 (`CNC_PORT_PLAN.md` 참고)

## 대상 사용자
- 나이 많은 치과의사도 쉽게 쓸 수 있어야 한다: **심플, 큰 글씨, 명확한 단계**
- 본문 최소 16px, 버튼 높이 최소 52px, 아이콘만 있는 버튼 금지(항상 글자 라벨)
- 글자 크기 100% / 115% / 130% (헤더 A / A+ / A++, `localStorage.allabut_font_scale`) → CSS 는 rem 단위
- 에러는 해당 칸 바로 아래 빨간 글씨 + 아이콘 (`uiFieldError`)
- 색 대비 충분히 (보조 글씨는 `--muted: #4B5563`)

## 디자인
- **디자인 스위치 `SITE_THEME`** (config.js) — 값 세 가지: `'navy'` = 네이비 스플릿(지금 기본) / `'mono'` = 흑백 미니멀 / `'classic'` = 처음 디자인(아래 다크 랜딩 · 네이비 · 골드 · 불꽃 인트로 — 이 "디자인" 절의 나머지 설명은 전부 classic 기준). 모르는 값이면 'classic'
  - `theme.js`(<head>, config.js 바로 다음)가 화면을 그리기 전에 `<html data-site-theme="navy|mono|classic">` + mono 일 때만 `theme-color` 흰색 + 처음부터 있는 로고에 `logo-mono` 클래스. JS 에서는 `cncSiteTheme()` · `cncIsMono()` · `cncIsNavy()`
  - **각 디자인의 스타일은 그 값일 때만**: navy = `css/theme-navy.css`(`html[data-site-theme="navy"]` 아래만) + `ui/landing-navy.js` / mono = `css/theme-mono.css` + `ui/landing-mono.js` / classic = `css/landing.css` · `css/app.css` 만.
    새 디자인을 더할 때도 기존 css 파일(landing · app · theme-mono)의 규칙은 고치지 않는다 → 다른 두 디자인은 픽셀까지 그대로 (navy 를 넣을 때 classic · mono 를 예전 커밋과 화면 54장씩 비교해서 확인 — 다른 곳은 시간에 따라 바뀌는 헤더 오른쪽 · 충전 QR 뿐)
  - **navy (네이비 스플릿) = 로그인 전 화면만** (랜딩 · 로그인 화면 · 로그인 전 회사소개/문의/법적 문서 `#screen-legal` 의 헤더와 푸터). **로그인 후 화면은 classic 그대로** (navy 전용 규칙 없음, 로그인 후 화면 42장이 classic 과 같음)
    - 색: 네이비 #001D4A · 골드 #D4AF37 · 옅은 면 #EEF1F6 · #F4F6FA · 글자 #001D4A · 보조 #4B5563 · 네이비 위 보조 #C9D2E3 (모든 글자 4.5:1 이상)
    - 헤더 = 네이비 띠(로고 all · but 흰색, A · 위첨자 골드 / 회사소개 · **가격 #/credit-policy**(landing-navy.js 가 넣음) · 언어 흰 글자 / [로그인] 골드 채움 + 네이비 글자 / TEST 배지 자리 그대로). 푸터 = 네이비 띠 + 흰 글자 ("Sold by · Manufactured by" 그대로, 화면에 고정하지 않고 본문 다음)
    - 랜딩 본문 `LandingNavy`: (1) 반반 Hero — 왼쪽 네이비(골드 선 + "CNC CUSTOM ABUTMENT · <5μm" · 큰 제목 300 clamp(36px, 4.4vw, 58px) · 설명 · [Start an order] 골드(`handleStartOrder`) · [How it works] 흰 테두리(#/about)) /
      오른쪽 #EEF1F6 — config.js `LANDING_IMAGE` 사진, 없으면 흰 카드 3장(소재 · 공차 · 제조사 = `cncManufacturerInfo()` 이름 + 인증, 비면 그 카드만 숨김) → 방문자 숫자 · Beta · 이벤트 배너(골드) · 광고 자리 →
      (2) Why allAbut(카드 4장, `about_why1~4` 재사용 · {manufacturer} 자리 채움) (3) How it works(옅은 면 5단계 `wiz_step1~5` 네이비 동그라미 · 3번만 골드 / 네이비 면 "Five steps, all online." + 납품일 · 취소 안내)
      (4) 가격(판매 중 어버트먼트 패키지 카드 — 크레딧 수 + 1개당 단가, 가장 큰 패키지만 네이비 채움, "THB per tooth, excluding {vat}% VAT · 12개월" — VAT 는 로그인 전에 못 읽어서 7, 못 읽으면 구역 전체 숨김)
      (5) 마지막 띠 "Send your first case today." + [Create account](네이비, 회원가입 탭) + [Chat on LINE](LINE 초록 #05893C, `cncContactInfo().lineUrl`). 문구 키 `navy_*` 9개 언어
    - 로그인 화면 = 네이비 바탕 + 흰 카드(위 골드 선), 주 버튼 네이비, 선택 탭 골드 밑줄. 큰 로고 · 슬로건 숨김, **불꽃 인트로는 classic 일 때만**. 3D 뷰어 · 로고는 classic 그대로(logo-mono · 회색 모델 · 흰 theme-color 는 mono 에서만)
  - **새 화면 · 새 색을 만들 때는 `css/theme-mono.css` 와 `css/theme-navy.css` 도 같이 본다** (navy 는 로그인 전 화면, mono 는 사이트 전체)
  - **mono 스타일은 전부 `css/theme-mono.css` 의 `html[data-site-theme="mono"]` 아래에만** — `css/landing.css` · `css/app.css` 의 기존 규칙은 고치지 않는다 → 'classic' 이면 예전과 픽셀까지 같아요 (예전 커밋과 화면 54장 비교로 확인)
  - theme-mono.css = 1) 색 변수(`--navy` · `--text` → #0B0F17, `--gold` → #0B0F17(선), `--gold-dark` → #4B5563, `--bg` #F5F5F7, `--dark` 흰색, `--muted-light` #575E6B …) →
    2) 자동 규칙(예전 css 에 직접 써 넣은 네이비 · 골드 계열 색을 같은 선택자로 흑백 값으로 — scratchpad 의 생성 스크립트가 만들었고, 이제는 손으로 고쳐도 돼요) → 3)~7) 손으로 쓴 규칙 (골드로 채운 버튼 · 배지 = 검정 + 흰 글자, 그래프 계열 색 원래대로, 랜딩 · 로그인 · 회사소개 Hero, 대비 수정)
  - mono 색 규칙: 바탕 #FFFFFF · 앱 바탕 #F5F5F7 · 카드 흰색 · 글자 #0B0F17 · 보조 #4B5563 · 선 #E5E7EB. 네이비 · 골드 안 씀. 골드/네이비 채움 → 검정 + 흰 글자, 골드 선 → 검정 · 회색 선, 골드 글자 → #4B5563, 네이비 글자 → #0B0F17.
    **그대로 두는 색**: `STAGE_COLORS` 단계 배지 · 오류 빨강 · 성공 초록 · 경고 노랑 · TEST 배지 · LINE 초록 · 관리자 그래프 계열 색(.bar 네이비 / .bar.teeth · .fin-bar 골드) · 역할 · 안내 파랑. 모든 글자 대비 4.5:1 이상 (자동 대비 검사)
  - mono 로그인 전: 랜딩 = 메뉴 줄(로고 · 회사소개 · **가격 #/credit-policy** · 언어 · 로그인) + 본문 `ui/landing-mono.js`(`LandingMono`, mono 일 때만 그려요):
    큰 제목 두 줄(`mono_hero_l1` / 회색 `mono_hero_l2`, clamp(40px, 7vw, 84px) · 600) · 설명 · 검정 알약 [Start an order](`handleStartOrder`) + "See how it works"(#/about) ·
    옅은 면(#F5F5F7, 모서리 32px) 안에 주문 5단계 01~05(`wiz_step1~5`, config.js `LANDING_IMAGE` 가 있으면 면 위쪽에 사진) · 세 가지 사실(<5μm · 소재 · "치아 1개당 {가장 싼 어버트먼트 단가} THB 부터, VAT 별도" — 못 읽으면 그 항목만 숨김).
    방문자 숫자(회색) · Beta test service · 이벤트 배너(검정 알약) · 광고 자리 · 푸터 "Sold by · Manufactured by" 는 그대로. 랜딩 · 로그인 푸터는 mono 에서 화면에 고정하지 않고 본문 다음에.
    큰 로고 · 슬로건은 mono 에서 숨김, **불꽃 인트로는 classic 일 때만** (app.js, 코드는 그대로). 로그인 화면 = #F5F5F7 + 흰 카드 + 검정 버튼. 회사소개 Hero = 옅은 면 + 검정 글자
  - mono 로고 = `logo-mono`(all · A · but 검정, 위첨자 #4B5563) — `logoHtml()` · 회사소개 · theme.js 가 붙여요. 3D 뷰어 모델 색: classic 골드 / mono 밝은 회색 (`cnc-viewer.js`)
  - **새 화면 · 새 색을 만들 때는 `css/theme-mono.css` 에도 같이 넣는다** (네이비 · 골드 · 그 연한 색을 직접 쓰면 mono 값도 정하기, 새 문구는 9개 언어). mono 에서 바꾸는 건 색 · 로고 · 버튼 색까지 (화면 구성 · 이모지 · 메뉴 순서는 두 디자인이 같게)
  - **되돌리는 방법 3가지**: (1) `config.js` 의 `SITE_THEME = 'classic'`(처음 디자인) 또는 `'mono'`(흑백) 으로 바꾸고 push (가장 쉬움 — 다른 디자인 코드는 남지만 하나도 적용되지 않아요)
    (2) `git revert <디자인 커밋>` 로 그 커밋 통째로 되돌리기 (navy 커밋을 되돌리면 mono 가 기본으로, mono 커밋까지 되돌리면 classic 만)
    (3) 태그 `before-navy-design` = navy 를 넣기 직전 커밋 `aeaaa21` · `before-mono-design` = mono 를 넣기 직전 커밋 `65a09c0` (`git diff before-navy-design` 으로 바뀐 곳 확인)
- 랜딩·로그인: 다크 `#06090f` + 골드 로고 (B1 스타일), 로그인은 흰색 카드
- **로그인 전 화면: 흰 헤더 · 흰 푸터 + 다크 본문.** 상단 메뉴 줄 `.landing-nav`(랜딩 · 로그인 화면 `.auth-nav`)는 흰 배경 + 아래 1px 경계선,
  작은 로고는 `logo-light`(all/but 네이비, A·5μm 골드), 회사소개·언어 네이비, "로그인" 버튼 네이비 테두리·글자(호버 네이비 배경 + 흰 글자).
  푸터 `.public-footer` 흰 배경 + 위 경계선, 글자 #4B5563, 링크 네이비(호버 밑줄). 색은 `css/landing.css` `:root` 의 `--public-bar-*` · `--public-footer-*`.
  회사소개·문의·법적 문서(screen-legal)는 원래 흰 헤더·푸터
- 랜딩(첫 화면): 상단 흰 메뉴 줄(작은 로고 · 회사소개 · 언어 · "로그인") + 가운데 큰 로고 `.logo-hero`(`clamp(40px, 11vw, 72px)`, 안의 비율 em 그대로) + 슬로건 + 이벤트 배너 + 푸터.
  가운데 Start Order 버튼·About 링크는 없앴어요 (로그인은 상단 버튼 `handleStartOrder()` 하나). 메뉴 줄 작은 로고·로그인 화면·앱 헤더 로고 크기는 그대로
- 로고 불꽃 인트로 `ui/logo-intro.js` (`LogoIntro`, 차분한 버전 약 8초): A 꼭짓점 → 금빛 불씨(솟기 1.4초) → 아주 천천히 터짐(빛줄기 140개 + 꼬리) → 2.1초 뒤부터 2.0초 동안 빛이 모여 5μm → 0.8초 동안 진짜 글자로 → 빛나는 선(`.logo-um.shine`, 1.8초).
  불꽃 위쪽 한계는 흰 메뉴 줄 실제 높이 + 16px (`topLimit`) → 메뉴 줄에 가리지 않아요.
  랜딩이 보일 때 페이지를 열 때마다 1번 (새로고침 포함, 모듈 변수 `playedThisLoad` — 같은 페이지에서 로그인 화면 갔다 돌아오면 다시 안 함. 예전 `sessionStorage.allabut_intro_played` 는 지움).
  app.js 의 `showScreen('landing')` 이 페이드인 뒤 `LogoIntro.maybePlay()`, 랜딩을 떠나면 `LogoIntro.stop()`.
  prefers-reduced-motion 이면 안 함. 캔버스 `canvas.logo-fx` 는 랜딩 안 `position:absolute` · `pointer-events:none` · z-index 0 (메뉴 z-index 2, 로고·슬로건·배너 z-index 1)
- 로그인 후 앱: 밝은 테마
  - 배경 `#F7F8FA`, 카드 흰색, 글자 네이비 `#001D4A`, 포인트 골드 `#D4AF37`
  - 보조 회색 `#6B7280`, 테두리 `#E5E7EB`
- 밝은 배경 로고: all/but 네이비, A 골드, 5μm 골드
- 색은 `css/landing.css` 의 `:root` 변수 한 곳에서 정의

## 폰트
- **IBM Plex Mono (`.mono`) 는 숫자·주문번호·요청번호·금액에만.** 글자가 들어간 문구(라벨, "5단계 중 1단계", 날짜처럼 월 이름이 나오는 것, 파일 이름, 단위 "크레딧")는 Mono 금지
  - 숫자 + 단위는 `<span class="mono">24</span> <span>크레딧</span>` 처럼 나눠요
- 그 밖의 모든 글자는 IBM Plex Sans + 언어별 대체 글꼴 (`--font-sans`): Thai → IBM Plex Sans Thai(→ Noto Sans Thai), 한국어 → IBM Plex Sans KR(→ Noto Sans KR), 아랍어·페르시아어 → IBM Plex Sans Arabic, 중국어 → Noto Sans SC·시스템 글꼴 — Google Fonts CDN
- `--font-mono` 도 뒤에 Sans 대체 글꼴을 달아 둬서, 실수로 Mono 안에 글자가 들어가도 깨지지 않아요
- 헤더 로고 31px, 5μm 위첨자 골드 최소 10px

## 확정 사항
- 치아 32개 (FDI, 사랑니 포함)
- 브랜드·사이즈·쉐이드는 **치아마다 따로** (브랜드 필수, 사이즈 선택, **쉐이드는 크라운 세트 치아만 필수** — 아래 "쉐이드 규칙")
- 한 주문 = 환자 1명 (`cases` 배열에 1개)
- 파일: STL / PLY / OBJ / 3MF / JPG / PNG / PDF, 파일당 50MB, 최대 10개
- 1 치아 = 1 크레딧 (차감은 DB 함수 `create_cnc_order` 가 한 번에 처리). 크레딧은 **상품 종류마다 따로** (아래 "상품 두 종류")
- 9개 언어: en ko th zh vi es tr ar fa (ar / fa 는 RTL)

## 상품 두 종류 — 🔩 커스텀 어버트먼트 / 👑 어버트먼트 + 지르코니아 크라운 세트 (sql/018_two_products.sql)
- 종류 값 `'abutment'`(기본) | `'crown_set'`. 화면 이름 `uiProductName(p, short)` = "🔩 커스텀 어버트먼트" · "👑 어버트먼트 + 지르코니아 크라운 세트" (짧게 "🔩 어버트먼트" · "👑 크라운 세트"), 문구 키 `product_*` 9개 언어
- **크레딧은 종류마다 따로**: 어버트먼트 크레딧으로 크라운 세트를 주문할 수 없고 반대도 안 돼요. 1 치아 = 그 종류 1 크레딧
- DB 칸: `credit_packages.product` · `topup_requests.product` · `credit_lots.product` (기존 줄 전부 abutment), `credit_wallets.balance` = **어버트먼트**(예전 그대로) + `balance_crown_set`,
  `cnc_orders.crown_set_count`(세트 치아 수), `credit_history.product`('abutment' | 'crown_set' | 'mixed' — 트리거가 묶음 · 주문을 보고 채움), `payment_settings.signup_bonus_product`, `signup_bonus_grants.product`
  - 가격표 중복 검사 = (종류, 크레딧). 세트 패키지 5개(1 · 10 · 30 · 50 · 100, 임시 9,999)는 **판매 중지로 시작** → 가격을 정한 뒤 관리자가 켜요
  - 잔액은 `_credit_recalc` / `_credit_expire_lots` 가 종류별로 계산, 차감 `_credit_take(…, p_product)` · `_credit_take_mode(…, p_product)` (예전 인자 모양 = 어버트먼트)
- 충전: `create_topup_request` 가 패키지 종류를 요청에 저장 → `admin_approve_topup` 이 같은 종류 묶음. 고객 충전 화면 맨 위 탭 [🔩 어버트먼트] [👑 크라운 세트] (`PageTopup.tab`, 다른 화면에서 보낼 땐 `PageTopup.preset`),
  판매 중인 세트 패키지가 없으면 세트 탭에 "곧 출시돼요" (탭은 보여요)
- 주문: 3단계 치아 카드마다 "제품" [어버트먼트만 | 크라운 세트] (`draft.details[n].product`, 기본 abutment, 모두 적용 `applyProductAll`) → `cases[].teeth[].product`.
  세트 크레딧이 0 이고 판매 중인 세트 패키지도 없으면 세트 버튼 비활성 + "곧 출시". 쉐이드는 세트 치아만 (지르코니아 크라운 색, 아래 "쉐이드 규칙")
  - `create_cnc_order` 가 치아마다 product 를 채워 저장(없으면 abutment, 모르는 값 `INVALID_PRODUCT`) → 종류별 필요 수만큼 각 종류 묶음에서 FIFO (무료 · 등록 주소 전용 규칙은 종류별로 그대로).
    모자라면 `INSUFFICIENT_CREDITS_ABUTMENT` / `INSUFFICIENT_CREDITS_CROWN_SET` (등록 주소 무료로 채울 수 있으면 `bonus_address_only`). 취소 복구는 `credit_lot_usage` → 원래 묶음 (종류 그대로)
  - 미리보기 `PageNew.creditSplits()` (종류별) / `creditSplit()` (합친 것). 세트 치아가 없으면 요약 · 5단계는 예전 모양 그대로(칸 id `credit-split` · `after-split` · `sum-after`),
    있으면 "어버트먼트 n · 크라운 세트 n" + 종류마다 상자(세트는 `-crown`), 모자라면 그 종류 충전하기 버튼
- 잔액 표시: 상태 `APP.balance`(어버트먼트) · `APP.purchasedCredits` · `APP.freeTotal` · `APP.freeCredits` · `APP.paidCredits` 는 **전부 어버트먼트**, 세트는 `APP.crownSet`
  { total, purchased, freeTotal, freeCredits, paidCredits } + `APP.crownSetOnSale` (`get_my_credit_summary()` 의 `crown_set` · `crown_set_on_sale`). 종류별 값 `cncProductCredits(p)`
  - 헤더: 세트 크레딧이 있거나 판매 중이면 "🔩 12 · 👑 3" (`cncShowCrownSet()`), 아니면 예전 "💳 12 크레딧". fit-7(가장 좁을 때)은 두 숫자를 위아래 두 줄로 — 360 · 1024 · 1440px 확인
  - 홈 · 내 정보 · 충전: 세트를 보여줄 때는 종류별 줄 `uiProductCreditsHtml()` (줄마다 합계 + 💳 충전 · 🎁 무료), 아니면 예전 모양. 내 주문 카드 · 상세: 치아별 제품(`uiProductBadge`, `uiProductCountsHtml`)
- 무료 크레딧: `admin_grant_free_credits(…, p_product)` · `admin_revoke_free_credits(…, p_product)` · `admin_add_credits(…, p_product)` (기본 abutment, 관리자 화면에 "종류" 선택). 신규 가입 이벤트 "지급 종류"(`signup_bonus_product`) —
  승인 대기 신청은 신청할 때의 종류로
- 현금 환불 재계산 "1개 가격" = 그 묶음 종류의 1크레딧 패키지 가격 (`_credit_refund_quote` 의 묶음마다 `single_price`)
- 집계: `admin_finance_month.by_product`(입금 · 사용 · 만료) · `by_package` 에 product, `admin_outstanding_credits.by_product`, `admin_finance_free_month.by_product`, `admin_topups_export` product 칸(CSV 에도),
  커미션 항목 product (입금 기준 그대로, per_credit 은 종류 상관없이 크레딧 수), `sales_my_payments` product, 만료 알림 lots 에 product, 계정 삭제 요청 남은 크레딧 = 두 종류 합
- 관리자 화면: Settings 크레딧 패키지 표 두 개(종류별, 각각 "+ 패키지 추가", 세트 표 위 안내 · 새 세트 패키지는 판매 중지로 시작), 충전 요청 목록 · 상세, 고객 목록(👑 n) · 상세(종류별 잔액 · 묶음 배지 · 종류 골라 지급/차감),
  무료 지급 · 회수, 주문 상세(치아별 제품 + 개수), 매출 대시보드 "종류별" 표, 커미션 상세 · CSV, 이벤트 설정 "지급 종류"
- LINE: 크레딧 · 충전 카드에 "Product: Abutment credits / Crown set credits" 줄(product 가 있을 때), 세트가 있으면 잔액 줄 "🔩 12 · 👑 3" + 작은 줄 "Abutment 12 · Crown set 3"(9개 언어, `balanceTotals`),
  주문 카드 Teeth 줄의 세트 치아는 브랜드 옆 "👑 Set". 샘플 `13-crown-set-order-admin` · `14-crown-set-credits-customer`
- 법적 문서 `{{PRICE_TABLE}}` 은 종류마다 표(판매 중인 패키지가 있는 종류만), `{single_price}` · 환불 예시는 어버트먼트 기준

## 쉐이드 규칙 — 크라운 세트 치아만 (sql/019_shade_and_ad_banners.sql)
- 쉐이드 = 지르코니아 크라운 색 → **크라운 세트 치아만 필수**, 어버트먼트만인 치아는 쉐이드가 없어요
- 새 주문 3단계: 제품이 "어버트먼트만"이면 쉐이드 칸 자체가 없고 저장값도 '' / "크라운 세트"면 쉐이드 칸 + 필수.
  세트 → 어버트먼트로 바꾸면 쉐이드를 지우고, 어버트먼트 → 세트면 빈 값(선택 안내)으로 나타나요 (`cncSetToothDetail`). "모든 치아에 적용"의 쉐이드는 세트 치아가 있을 때만 보이고 세트 치아에만 넣어요
- 검사: `cncValidateStep(…, 3)` 과 `create_cnc_order` 둘 다 "crown_set 치아만 쉐이드 필수" (서버 에러 `SHADE_REQUIRED_CROWN_SET`), 서버는 어버트먼트 치아의 color 를 '' 로 저장
- 표시: 요약 카드 · 5단계 확인 · 내 주문 상세 · 관리자 주문 상세 · LINE 주문 카드 Teeth 줄 = 세트 치아만 쉐이드 (`cncToothShade(tt)`, 어버트먼트 치아는 자리를 비움 — LINE 은 빈 글자 대신 `filler`).
  예전 주문 · draft 에 남은 어버트먼트 치아의 쉐이드 값은 그대로 두고 화면에만 안 보여요
- 문구: `wiz_step3_desc` · `wiz_shade_per_tooth` · `guide_step3_text`(이용 가이드 · 새 주문 도움말) · `shade_crown_only_note` 9개 언어

## 광고 배너 — 자체 배너만 (sql/019_shade_and_ad_banners.sql)
- **외부 광고 업체 스크립트(애드센스 등)는 넣지 않는다.** 배너 이미지 · 링크는 관리자가 직접 등록
- 표 `ad_banners` (RLS 켜고 정책 없음 = 함수로만): name(관리용) · advertiser · slot('landing' | 'home' | 'order_done') · image_desktop_url · image_mobile_url · link_url · alt_text ·
  starts_at · ends_at(방콕 날짜, 비우면 무기한) · active(기본 false) · sort_order · created_by · created_at · updated_at
  - `get_active_ad_banners(p_slot)` 누구나(anon 포함): 켜짐 + 방콕 오늘이 기간 안 + PC 이미지 있음, sort_order 순 (광고주 · 이름은 안 내보내요)
  - manager 이상: `admin_list_ad_banners()`(+ 누적 노출 · 클릭) · `admin_save_ad_banner(...)`(링크 · 이미지 주소 **https 만** `INVALID_URL`, 이름 `NAME_REQUIRED`, 자리 `INVALID_SLOT`, PC 이미지 `IMAGE_REQUIRED`, 기간 `INVALID_DATES`) ·
    `admin_delete_ad_banner(p_id)`(노출 · 클릭 기록은 남음) · `admin_ad_stats(from, to)`(기간별 배너마다 노출 · 클릭, 지운 배너는 '#번호'). 작업 기록 'ad_banner_saved' · 'ad_banner_deleted'
- 노출 · 클릭: `site_events` kind 'ad_view' · 'ad_click' + `ad_banner_id` (`log_site_event(…, p_banner)`). 방문 통계는 visit · pageview 만 세서 그대로, 보관 24개월도 같이.
  같은 페이지 보기에서 같은 배너 노출은 1번만 (`AdBanner.seen`, 경로가 바뀌거나 랜딩이 다시 보이거나 주문 완료 화면이면 새 페이지 보기), 자리가 화면에 보일 때만 셈
- Storage 공개 버킷 `ad-banners` (jpg · png · webp, 2MB, 올리기 · 바꾸기 · 지우기 · 목록 = `has_admin_role('manager')`). 019 가 만들고, 권한이 없으면 notice → 대시보드에서 직접(Public, 2MB, 형식 3개).
  경로 `banners/{시각}_{무작위}_{안전한 파일명}`, 배너를 지우면 우리 버킷 이미지도 지움 (`cncAdBucketPath`)
- 자리 (`ui/ad-banner.js` `AdBanner`, `<div class="ad-slot" data-ad-slot="…" hidden>`): **노출 중인 배너가 없으면 hidden 그대로 = 자리 자체가 없음** (높이 0)
  - landing: 랜딩 슬로건 아래 (PC 728×90 비율 · 휴대폰 600px 미만 320×100 비율) — `showScreen('landing')` 이 보일 때마다 `AdBanner.mountAll`
  - home: 고객 홈 크레딧 카드 아래 (카드 폭, `#home-ad`) / order_done: 주문 완료 화면 안내 아래 (`#done-ad`)
  - **새 주문 작성 중 · 충전 결제 · 관리자 화면에는 절대 넣지 않는다**
  - 작은 회색 "AD", 이미지 클릭 → 새 탭 `target="_blank" rel="noopener sponsored"`, `<picture>` 로 PC/휴대폰 이미지 자동 선택(휴대폰 이미지가 없으면 PC 이미지),
    같은 자리 여러 개면 sort_order 순으로 7초마다 천천히(opacity 1.2초) 바뀜, prefers-reduced-motion 이면 첫 배너로 고정. 서비스 상태(test/live)와 상관없이 똑같이
- 로직 `cnc/cnc-ads.js` (`cncLoadActiveBanners` 5분 기억 · `cncTrackAd` · 관리자 함수 · `cncAdStatus` 꺼짐/예정/노출 중/종료 · `cncAdCtr` · CSV), 화면 `ui/ad-banner.js`, 관리자 `ui/page-admin-ads.js`
- 관리자 Settings → "📢 광고 배너" (manager 이상 — **Settings 탭이 manager 에게도 열리고, manager 는 이 섹션만** 보여요. owner 는 기존 설정 + 맨 아래 이 섹션):
  목록(자리 · 이름 · 광고주 · 기간 · 상태 배지 · 노출 · 클릭 · 클릭률) + 추가/수정 창(이미지 2개 올리기 · 미리보기, 링크, 대체 글자, 기간 `uiDateField`, 순서, 켜기) + 삭제(확인창)
- Dashboard 방문 통계 아래 "📢 광고" 카드 (manager 이상): 기간(오늘 · 7일 · 30일 · 이번 달 · 지난달)별 배너마다 노출 · 클릭 · 클릭률, CSV 는 owner (`allabut-ads-…csv`)
- 개인정보처리방침: 광고 노출 · 클릭은 방문 통계와 같은 방식(같은 방문자 ID · 기기 · 언어 · 나라)으로 기록 — 방침 "Banners on the Service" 섹션에 공개 (자체 배너만 · 외부 광고 네트워크 없음 · 맞춤형 광고 없음 · 광고주에게는 합계만)

## 크레딧 · 충전 정책 (확정)
- 가격 (VAT 7% 별도, 개당 THB): 1개 2,200 / 10개 2,050 / 30개 1,900 / 50개 1,750 / 100개 1,500
  → `credit_packages` 테이블, 관리자 Settings 에서 수정. 금액 계산은 항상 DB 함수(`create_topup_request`)가 함
- 결제: PromptPay QR(EMVCo 페이로드를 `cnc/promptpay.js` 가 직접 생성) + 계좌이체 → 입금 슬립(`topup-slips/{user_id}/...`, 10MB, 이미지·PDF) → 관리자 승인
- 크레딧 묶음(`credit_lots`): 충전(승인)일로부터 12개월 유효, 사용은 먼저 만료되는 묶음부터 (FIFO, `credit_lot_usage` 에 주문별 기록)
- 만료 30일·7일 전 LINE 알림, 만료되면 자동 소멸 + 이력 'expire' (pg_cron, 방콕 새벽 1시)
- 주문 취소 크레딧은 원래 묶음으로 복구 (원래 유효기간 유지, 이미 만료된 묶음 몫은 복구 안 함 + 이력)
- 관리자 지급(+) = 보너스 묶음 (12개월, 단가 0 = 현금 환불 불가 → 무료 크레딧, 아래 "무료 크레딧"), 차감(-) = FIFO
- 현금 환불: 충전 14일 이내 + 미사용 = 전액 / 일부 사용 = 사용분을 1개 가격(2,200 + VAT)으로 재계산 후 잔액 / 만료·보너스·이전 잔액 불가.
  관리자 화면에는 계산기(`admin_refund_quote`)와 기록(`admin_refund_cash`)만, 송금은 수동
- `credit_wallets.balance` = 만료 안 된 묶음 remaining 합계 (DB 함수가 항상 맞춤). 화면은 계속 balance 를 읽음
- SQL: `sql/002_credit_topups.sql`, 설정 안내: `TOPUP_SETUP.md`
- 금액 표시는 `formatTHB()` (언어와 상관없이 21,935.00 THB)

## 무료 크레딧 · 등록된 치과 정보 (sql/008_free_credits.sql, sql/009_free_credit_grants.sql)
- 화면 이름은 전부 **"🎁 무료 크레딧" (en: Free credits)**. "가입 선물"이라는 말은 쓰지 않는다 (DB 이름 `signup_bonus_*`, `grant_signup_bonus` 는 그대로)
- **무료 묶음 = `credit_lots.source` 'free'(새로 지급) 또는 'bonus'(예전 관리자 지급·예전 신규 가입 지급)** (`_is_free_source`, 화면 `cncIsFreeLot`). 현금 환불 불가
  - 기본은 "등록 주소 배송 전용" `restriction = 'clinic_address_only'` (`cncIsRestrictedLot`). 관리자가 지급할 때 끄면 어느 주소로든 쓸 수 있는 무료 크레딧
  - 이벤트 이름 `credit_lots.event_name`, 지급한 사람 `granted_by`. 새 이력 설명은 `"Free credits: 이벤트명 (valid until …)"`, 회수는 `"Free credits revoked: 사유"`
- 주문: 등록 주소 전용 무료 크레딧은 주문 1단계의 **"무료 크레딧으로 주문하기"** 를 켠 주문에만 사용 → 배송 정보는 **등록된 치과 정보로 고정**(화면에서 못 고침, DB 도 강제로 바꿈)
  - 켜지 않은 주문은 등록 주소 전용 묶음을 건너뜀. 모자라고 그 묶음으로 채울 수 있으면 에러 `bonus_address_only` (→ "무료 크레딧으로 주문하기" 켜기 / 충전하기 버튼)
  - 켠 주문은 무료 먼저 → 모자라면 나머지. `cnc_orders.bonus_used`(사용한 등록 주소 전용 무료 수), `addr_norm`(주소 정규화 `_norm_addr`) 저장. 판단은 전부 `create_cnc_order(..., p_use_free)` 안에서
  - 주문 취소는 원래 묶음으로 복구 → restriction 그대로. 무료 크레딧도 **종류별** (어버트먼트 무료는 어버트먼트 치아에만, 세트 무료는 세트 치아에만 — sql/018)
- **등록된 치과 정보** = `profiles.reg_clinic / reg_addr / reg_phone / reg_addr_norm / clinic_locked_at`: 치과 이름·주소·전화가 처음 모두 채워지는 순간(가입 때 다 넣었으면 가입 시점) 트리거가 잠금.
  고객이 프로필을 고쳐도 등록 정보는 그대로(유료 주문 배송지만 바뀜). 변경은 `request_clinic_change()` → 관리자(manager 이상) `admin_review_clinic_change()` 승인. 회원가입에 주소 칸(필수, sql/010)
- **🎁 신규 가입 무료 크레딧 이벤트**: `payment_settings.signup_bonus_credits` + sql/010 의 기간·승인 설정 (아래 "회원 필수 정보 · 신규 가입 이벤트"). Settings 의 별도 카드 `signupEventHtml`
- **관리자 무료 크레딧 지급**(manager 이상, 고객 상세 `freeGrantHtml`): 이벤트 이름(필수) · 크레딧 수(1~1000) · 유효기간(일, 기본 365) · 등록 주소 배송 전용(기본 체크) → 확인창 → `admin_grant_free_credits()`
  (묶음 + 잔액 + 이력 'charge' + `admin_audit_log` 'credits_added'). 회수 `admin_revoke_free_credits()` (사유 필수, 무료 묶음에서만, 이력 'adjust' → 작업 기록 credits_removed)
- 화면: `APP.freeCredits`(등록 주소 전용 무료) / `APP.paidCredits`(어디로든 = 산 + 제한 없는 무료) / 보여주기용 `APP.purchasedCredits`, `APP.freeTotal` (`get_my_credit_summary()`: paid · free · free_open, 008 실행 전이면 전부 산 크레딧)
  - 미리보기 `cncCreditSplit()`(무료 n / 충전 n), 묶음 목록 "🎁 무료 크레딧 · 등록된 치과 주소 배송 전용"(+ 이벤트 이름), Profile "등록된 치과 정보" 카드 + 변경 요청
  - 홈: 30일 안에 들어온 무료 크레딧 → "🎁 무료 크레딧 n개가 들어왔어요 (유효기간 ~날짜)" (✕ 로 닫으면 `localStorage.allabut_free_seen_{lot id}`)
- 관리자(`ui/page-admin-free.js`): 주문 목록·상세 "🎁 무료 크레딧 사용 — 등록 주소로만 출고" 배지 + 출고 주소 크게, Customers 탭 맨 위 변경 요청(지금 vs 요청), 승인 전 미사용 무료 크레딧 경고
- 매출 대시보드: 무료 크레딧은 매출이 아니라 "🎁 지급한 무료 크레딧"(지급 · 사용 · 만료) 카드로 따로 (`admin_finance_free_month`), 사용 카드는 산 크레딧 수 + "무료 n"
- LINE: 무료 크레딧 지급은 묶음 정보로 판단(`isFreeCharge`, 예전 "Signup bonus"·"Welcome gift" 이력도 인식) → 고객 "🎁 Free credits" 카드(9개 언어, 주문하기 버튼 `#/new`) + 사본
- **002 를 다시 실행하면 008 → 009 도 다시**, **008 을 다시 실행하면 009 도 다시** (함수가 예전 모양으로 돌아가서)
- **SQL 재실행 순서 (전체)**: 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013 → 014 → 015 → 016 → 017 → 018 → 019 → 020 → 021 → 022 → 023 → 024 → 025 → 026.
  **002 · 003 · 004 · 008 · 009 · 010 · 011 · 012 · 016 중 하나를 다시 실행하면 018 도 다시** (함수가 상품 종류를 모르는 예전 모양으로 돌아가서).
  **018 이후에는 002 를 다시 실행하지 않는다** (가격표 줄 `on conflict (credits)` 가 오류 — 중복 검사가 (종류, 크레딧) 으로 바뀌어서. 꼭 필요하면 먼저 확인)
  → 그 다음 **019** → **020** (전체 순서 끝 = 017 → 018 → 019 → 020). **020 은 다른 파일의 함수를 다시 정의하지 않아요** (새 칸 · 표 · 함수 · 트리거만) → 앞 파일을 다시 실행해도 020 은 다시 안 해도 돼요 (해도 안전, 보관 설정 · 모드는 그대로). **008 · 012 · 018 을 다시 실행하면 019 도 다시** (create_cnc_order 가 쉐이드 규칙을 모르는 모양으로),
  **013 을 다시 실행하면 019 도 다시** (log_site_event 가 광고 종류 · p_banner 를 모르는 모양으로 — 013 은 예전 인자 모양을 새로 만들어서 019 의 것과 둘이 생겨요)
  **`sql/launch_reset.sql` 은 일반 재실행 순서에 포함하지 않는다** (정식 오픈 날 1번만, 아래 "서비스 상태 · TEST 배지 · 정식 오픈 초기화")
  **008 을 다시 실행하면 009 → 010 → 012 도 다시** (create_cnc_order 가 008 모양 = 주문할 때 deadline 저장으로 돌아가서)
  **005 를 다시 실행하면 015 → 016 도 다시** (is_admin · admin_me · admin_add_member · admin_set_role 이 sales 를 모르는 예전 모양으로 돌아가서 → is_admin 이 sales 에게 열려요)
  **002 · 004 를 다시 실행하면 005 → 016 도 다시** (admin_refund_cash 가 묶음별 환불 기록이 없는 예전 모양으로 돌아가서 → 환불 마이너스 커미션이 "확인 필요"로만 남아요)
  **015 를 다시 실행하면 016 도 다시** (주문 기준 함수 · 칸 · 트리거가 다시 생겨서)
  **021 (세금계산서) — 010 을 다시 실행하면 021 도 다시** (identity 트리거 · `_profile_complete` · `check_signup_available` · `request_clinic_change` · `admin_review_clinic_change` 가 국가를 모르는 모양으로),
  **018 을 다시 실행하면 021 도 다시** (`create_topup_request` · `_credit_refund_quote` 가 해외 VAT · 충전별 VAT 를 모르는 모양으로). 그래서 018 을 다시 했으면 019 → 020 → 021 순서로
  **022 (전화 국가번호) — 021 을 다시 실행하면 022 도 다시** (`_norm_phone(p, country)` · `_valid_phone(p, country)` 가 태국 치과의 해외 번호를 모르는 모양으로). 010 → 021 → 022 순서
  **023 (직원 계정) — 005 · 015 를 다시 실행하면 023 도 다시** (권한 함수 `has_admin_role` · `is_admin` · `admin_role` · `is_sales_rep` · `admin_me` · `admin_set_role` 이 정지 · 확인 대기를 모르는 모양으로 → 정지된 직원이 다시 열려요),
  **010 · 013 · 016 을 다시 실행하면 023 도 다시** (`_suspicion_flags` · `admin_visit_stats` · `admin_set_customer_rep` 가 직원 계정을 다시 셈),
  **019 · 021 을 다시 실행하면 023 도 다시** (`create_cnc_order`(019 정의) · `create_topup_request`(021 정의) 맨 앞의 STAFF_ACCOUNT 검사가 빠짐 — 표 트리거 `trg_order_0_block_staff` · `trg_topup_0_block_staff` 가 남아서 막히긴 해요).
  그래서 018 을 다시 했으면 019 → 020 → 021 → 022 → 023 순서로
  **024 (작업 기록 역할별 읽기) — 005 를 다시 실행하면 024 도 다시** (005 가 "audit: team read" 규칙을 다시 만들어서 제작 직원이 다시 전부 봐요). 024 는 다른 파일의 함수를 다시 정의하지 않아요
  **025 (주문번호 날짜를 방콕 날짜로) — 008 · 012 · 018 · 019 · 023 을 다시 실행하면 025 도 다시** (`create_cnc_order` 가 UTC 날짜(`to_char(now(), 'YYMMDD')`) 모양으로 돌아가서).
  025 = 023 의 `create_cnc_order`(019 정의 + 맨 앞 STAFF_ACCOUNT) 그대로 + 주문번호 한 줄만 `to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD')`. **create_cnc_order 를 새로 고칠 때는 025 정의에서 시작**
  **026 (제조사 칸 · 세금 문서 품목 이름 CNC) — 021 을 다시 실행하면 026 도 다시** (`_issue_tax_doc_for_topup` 이 CNC 가 없는 품목 이름으로 돌아가서). 026 = 021 정의 그대로 + 품목 이름 두 줄만. 제조사 칸 · 값은 그대로 남아요
  **004 는 다시 실행해도 오류가 안 나요** (`admin_topups_export` 앞에 `drop function if exists` — 018 의 product 칸 모양과 달라서). 004 를 다시 했으면 위 규칙대로 005 → 016 → 018 도 다시

## 서비스 상태 · TEST 배지 · 정식 오픈 초기화 (sql/017_service_mode.sql, sql/launch_reset.sql, LAUNCH_CHECKLIST.md)
- `payment_settings.service_mode` = 'test'(기본) | 'live'. 읽기 `get_service_mode()` (누구나, anon 포함) / 바꾸기 `admin_set_service_mode(mode)` (**owner 만**, 작업 기록 'service_mode' from → to)
- 'test' 이면:
  - 사이트: 로고 옆 작은 알약 "TEST" (테두리 #D97706 · 글씨 #B45309 · 배경 #FFFBEB) — 랜딩 흰 메뉴 줄 · 로그인 화면 메뉴 줄 · 앱 헤더 · 법률 문서 헤더의 `<span class="test-badge-slot">`.
    마우스를 올리면 title 툴팁, 누르면 `uiPopover` 설명 (`test_badge_info`, 9개 언어). 랜딩 슬로건 옆 "Beta test service" (`#beta-note`, `beta_note`)
  - 헤더가 좁으면 **배지 글씨만** 작게: fit-4 10px → fit-6 9px → fit-7 8px (360 · 1024 · 1440px 에서 넘침 없게 확인)
  - LINE 카드: 윗줄 오른쪽 회색 "TEST" 배지 (사본이면 TEST → COPY 순서, `smallBadge()`). line-notify 가 알림마다 `refreshServiceMode()` 로 새로 읽어요 (못 읽으면 배지 없음). altText 는 그대로
- 'live' 이거나 값을 못 읽으면(017 실행 전 · 오류) 아무것도 안 보여요
- 로직 `cnc/cnc-service.js` (`CNC_SERVICE_MODE`, `cncLoadServiceMode()`, `cncSetServiceMode()`), 화면 `ui/service-badge.js` (`ServiceBadge.render()` — boot · 언어 변경 · renderLayout · 관리자 저장 후)
- 관리자 Settings 맨 위 "서비스 상태" 카드 (owner 만): [테스트 | 정식] 고르기 → 저장 → 확인 창 → 저장 (작업 기록)
- **service_mode 를 코드나 SQL 로 자동으로 'live' 로 바꾸지 않는다** (정식 전환은 관리자 화면에서 사람이)
- **`sql/launch_reset.sql` (번호 없음) = 정식 오픈 날 1번만, 사용자가 직접 실행.** 일반 재실행 순서에 포함하지 않는다. 되돌릴 수 없음 · 실행 전 백업
  - 안전장치: `v_confirm` 을 직접 'DELETE-ALL-TEST-DATA' 로 고쳐야 실행 (아니면 오류로 멈춤), 하나의 do 블록 = 한 트랜잭션 (오류면 전부 취소)
  - 지움(TRUNCATE … RESTART IDENTITY, 줄 트리거 · LINE 웹훅 안 돎): 주문 · 크레딧 묶음/사용/이력 · 충전 요청 · 환불 묶음 · 커미션 정산 · 가입 선물 기록 · 치과 정보 변경 요청 · 계정 삭제 요청 · 작업 기록 · 방문 기록 · 그룹 연결 코드 · invoices
    + 지갑 잔액 0 + 주문번호(cnc_order_seq) · 충전 요청번호(topup_seq) 1 부터
  - 남김: 가격 · 패키지 · payment_settings(이벤트 · 서비스 상태 포함) · company_settings · legal_versions · admins · sales_reps · sales_rep_rates · admin_notify_targets · blocked_email_domains · profiles
  - 옵션 `v_delete_customer_accounts` (기본 false): true 면 팀원(admins)이 아닌 계정의 profiles → auth.users 삭제
  - 끝나면 notice 로 지운 줄 수. Storage(cnc-files · cnc-designs · topup-slips)는 Supabase → Storage 에서 Empty bucket
  - 새 테스트 데이터 표를 만들면 launch_reset.sql 의 지울 표 목록에도 넣는다 (남길 설정 표가 그 표를 외래키로 가리키면 TRUNCATE 가 오류로 멈춰요 → 안전)
- 오픈 날 순서: `LAUNCH_CHECKLIST.md` (사이트에 안 올라감)

## 납품일은 디자인 승인 때 (sql/012_deadline_at_approval.sql)
- 이유: 디자인을 주고받는 동안 시간이 지나서, 주문할 때 미리 정한 납기를 못 지킬 수 있어요
- 새 주문에는 납품일 칸이 없어요 (1단계 "환자" + 안내 "📅 납품일은 디자인을 승인할 때 정해요" `deadline_at_approval_note`). draft 에 예전 deadline 이 있어도 무시
- DB: `cnc_orders.deadline` null 허용. `create_cnc_order` = 008 정의 그대로 + deadline 은 항상 null (p_deadline 인자는 예전 호출 호환용, 무시).
  `update_my_cnc_order` 는 deadline 을 안 바꿔요. `customer_cnc_action('approve')` → `DEADLINE_REQUIRED` (수정 요청·수령은 그대로)
- 고객 승인 = `customer_approve_design(p_id, p_deadline, p_note)` (`cncApproveDesign`): design_ready 일 때만(아니면 `STAGE_CHANGED`), 납품일 필수(`DEADLINE_REQUIRED`),
  납품일 ≥ 방콕 오늘 + `payment_settings.min_lead_days`(기본 1, 0~30, `DEADLINE_TOO_EARLY`) → 승인 + deadline + review_history `{ action: 'approved', deadline }` 한 번에.
  가장 빠른 날은 `get_deadline_rules()` (`cncGetDeadlineRules`). 012 실행 전이면 예전 승인으로 (납기 저장 안 됨)
- 승인 창(`PageOrders.approve`): 디자인 버전 요약 + 납품일 `uiDateField`(min = 가장 빠른 날) + 경고 "승인하면 가공이 시작돼요…" → [승인하고 납품일 확정]. 에러는 날짜 칸 아래 빨간 글씨
- 납기 표시 `uiDeadlineHtml(o, admin)`: 있으면 날짜 / 없으면 고객 "디자인 승인 때 결정", 관리자 회색 배지 "납기 미정 · 디자인 승인 때 결정". 타임라인에 📅 납품일(이전 → 새)
- 정렬 `cncSortProgress`: 할 일 있는 주문 → 납기 있는 것 빠른 순 → 납기 없는 것 접수일 순(먼저 들어온 것 먼저)
- 관리자 납기 변경 `admin_set_deadline(p_id, p_deadline, p_reason)` (manager, 사유 필수, 주문 상세 "📅 납기 변경" → 확인창) → review_history `deadline_changed`(old_deadline · by:'admin') + `admin_audit_log` 'order_deadline'
- 대시보드 "기한 임박"·"지금 처리할 일"은 deadline 이 있는 주문만. Settings 의 "승인 후 최소 일수"(owner, `min_lead_days`)
- LINE: 관리자 새 주문 카드 "Delivery · Set at design approval" / 승인 → 관리자 카드에 확정 납기 크게(`Section.big`) + 고객 확인 카드 "✅ 디자인 승인 · 납품일 확정"(사본 없음) /
  관리자 납기 변경 → 고객 "📅 납품일이 바뀌었어요"(이전 → 새 날짜, 사유) + 사본(Handled by). deadline 이 없으면 줄 자체를 빼요

## 주문 파일 보관 기간 · 자동 삭제 (sql/020_order_file_retention.sql, 설정 안내: RETENTION_SETUP.md)
- 개인정보처리방침의 약속 = **완료(done) 또는 취소된 지 24개월이 지난 주문의 스캔 · 사진 · 디자인 파일 삭제**. 방침 · 약관 · 가이드 문장과 이 기능은 같게 유지 (기간을 바꾸면 문서 3개 언어도)
- 칸: `cnc_orders.closed_at`(완료 · 취소된 시각 — 트리거 `trg_orders_closed_at`, 예전 주문은 020 이 단계 기록의 마지막 날짜 → 없으면 updated_at 으로 한 번 채움) · `files_purged_at` · `files_purged_count`
- 지울 때 (Edge Function `data-retention` 이 Storage 삭제가 성공한 뒤 `retention_finish_order`): Storage `cnc-files`(cases[].stlPaths) · `cnc-designs`(design_versions[].paths) 삭제 +
  주문 안 `patient` · `cases[].patient` → 'deleted', `cases[].memo` → '', `cases[].stls` · `stlPaths` → [], `design_versions[].paths` · `names` → [] (version · date 는 남김), `review_history[].note` → ''.
  **남기는 것**: 주문번호 · 날짜 · 단계 · 치아(번호 · 제품 · 브랜드 · 사이즈 · 쉐이드) · 치아 수 · 크레딧 사용 · 치과 · 배송 정보 (세금 · 회계). 입금 슬립(`topup-slips`)은 대상 아님
- 실행: pg_cron `allabut-data-retention` 매일 방콕 02:15 = UTC `15 19 * * *` (01:00 만료 · 01:05 알림 · 01:30 방문 기록 정리와 안 겹침) → `run_data_retention()` → pg_net 으로 Edge Function 호출,
  헤더 `x-notify-secret` = Vault `notify_secret` (**NOTIFY_SECRET 재사용, 값은 코드에 없음**). 함수 주소는 020 안 (만료 알림과 같은 프로젝트 주소). Edge Function 은 **Verify JWT OFF**
- 안전장치: `data_retention_settings`(id 1: months 12~120 기본 24 · mode **'preview'(기본)** | 'delete' · batch_limit 기본 50). **020 은 mode 를 절대 'delete' 로 바꾸지 않아요** — owner 가 관리자 카드에서.
  미리보기 = 지울 목록만 `retention_log`(status 'preview', 실행마다 새 목록으로 바꿈) / 실제 삭제 = 한 번에 batch_limit 개 · 오래된 것부터, 파일 삭제 실패는 'error' 기록만(다음 날 다시) · 그 사이 단계가 바뀐 주문은 'NOT_ELIGIBLE'.
  Edge Function 은 `cnc-files` · `cnc-designs` 버킷만, `..` · 앞 `/` 경로는 안 보냄, 이미 없는 파일은 오류 아님, 50초 넘으면 남은 주문은 다음 실행
- 기록 표 `retention_runs`(실행마다: trigger cron/manual · mode · months · due_total · orders_processed · files_found · files_deleted · errors · note) · `retention_log`(주문마다) — RLS 켜고 정책 없음, `launch_reset.sql` 지울 표 목록에 있음
- 함수: 서비스 키만 `retention_begin_run` · `retention_finish_order` · `retention_end_run` / owner `admin_get_retention()` · `admin_set_retention(p_months, p_mode)` · `admin_run_retention_now()` (작업 기록 'retention_settings' · 'retention_run')
- 관리자 Settings 맨 아래 "🗂 주문 파일 보관 기간" (owner, `ui/page-admin-retention.js`): 숫자(지금 대상 · 누적 삭제) · 보관 기간(24 가 아니면 "방침도 고치세요" 주황 안내) · 모드(실제 삭제로 바꿀 때 확인 창) ·
  [저장] [▶ 지금 실행] [↻ 새로고침] · 최근 실행 5번 · 미리보기 목록(최대 100) · 최근 결과(삭제 · 오류 20). 020 실행 전이면 안내만
- 고객 화면 (내 주문 상세): 파일 목록 대신 회색 안내 "🗂 보관 기간이 지나 파일이 삭제됐어요 · 날짜" (`uiRetentionNote`, 오류처럼 보이지 않게), 메모는 비어서 안 보임, 환자 ID 는 "삭제됨"(`cncPatientLabel`).
  관리자 주문 상세: 같은 안내 + 지운 파일 수, 디자인 버전 자리에 "디자인 파일 삭제됨 (버전 n개)". 홈 · 목록의 환자 표시도 `cncPatientLabel`

## 잔액 나눠 보기: 💳 충전(Paid) · 🎁 무료(Free) (sql/011_admin_credit_split.sql)
- **헤더는 전체 잔액만** (배지·팝오버 없음). 그 밖의 잔액이 보이는 곳은 전부 충전 / 무료를 나눠서, 항상 둘 다(0 이어도)
- 기준은 이미 있는 값만: `APP.purchasedCredits`(충전) / `APP.freeTotal`(무료 = 등록 주소 전용 + 제한 없는 무료) ← `get_my_credit_summary()`.
  요약 함수가 없으면(008 전) 전부 충전 (`APP.creditSummaryOk === false`)
- 공통 부품 `ui/layout.js`: `uiCreditSplitHtml({ expiry, note, paid, free, ... })` ("💳 충전 n · 🎁 무료 n", 숫자만 `.mono`, `expiry` = 종류마다 가장 빠른 만료일, `note` = 등록 주소 전용 무료 안내).
  값을 직접 넘기지 않은 부품은 `refreshBalance()` 때 `uiRefreshCreditSplits()` 로 자동 갱신. `setBalance()` 도 뒤에서 `refreshBalance()` 를 불러 나눔을 서버 값으로 맞춰요
- 묶음 종류 `cncLotKind(lot)` (요약과 같은 규칙: paid = 제한 없음 + 무료 출처 아님), 이력 줄 종류 `cncCreditHistoryKinds(rows)` (lot_id → 묶음 / 주문 줄 → bonus_used·credits_used / 그 밖 → 무료 설명이면 무료) → 배지 `uiCreditKindBadge`
- 표시 위치: 홈 크레딧 카드(만료일 + 안내) · Profile · 충전 · 새 주문 요약/5단계(이번 차감 + "주문 후 잔액") · 주문 완료 · 내 주문 상세(`uiOrderCreditUseHtml(credits_used, bonus_used)`) · 이력·묶음 배지
  - "주문 후 잔액"은 미리보기: 무료 몫은 무료에서, 나머지는 충전에서 먼저 (제한 없는 무료가 있으면 실제 DB 차감 순서와 조금 다를 수 있어요 — 주문 뒤엔 서버 값).
    **크레딧이 모자라 제출할 수 없으면 "주문 후 잔액" 줄(숫자 · 나눔)은 숨겨요** (5단계 크레딧 상자 · 요약 카드 둘 다)
- 관리자: Customers 목록 "💳 충전 / 🎁 무료" 두 칸, 고객 상세 나눔 + 이력·묶음 배지 ← `admin_credit_split(p_users)` (manager, sql/011). 011 실행 전이면 전부 충전
- LINE: 고객 카드 · 사본 카드의 "Credit balance" 아래 작은 줄 "Paid n · Free n" (R 문구 `split_paid` · `split_free`, `getCreditSplit` 이 credit_lots 에서 같은 규칙으로). 관리자 새 주문 카드는 없음

## 회원 필수 정보 · 중복 · 신규 가입 이벤트 · Turnstile (sql/010_signup_identity_campaign.sql)
- **필수 5개**: 본명(`profiles.full_name`) · 전화 · 치과명 · 치과 Tax ID(13자리 + 태국 체크섬) · 치과 주소. 회원가입 폼은 칸마다 빨간 글씨(`[data-su-err]`), 닉네임 칸 없음(닉네임 = 본명)
- **정규화는 SQL 과 JS 가 똑같이** (`cnc/cnc-identity.js` ↔ `_norm_phone` / `_norm_tax_id` / `_valid_tax_id`): Tax ID = 숫자만, 체크섬 = (11 − Σ d[i]·(13−i) % 11) % 10. **한쪽을 바꾸면 다른 쪽도**
  전화 = 치과 국가에 따라 (`_norm_phone(p, country)` ↔ `cncNormPhone(v, country)`, sql/021 + 022):
  태국 치과 + 태국 번호(+66 · 0066 · 66 · 0…) → `0812345678` / 태국 치과 + 해외 번호 → `+821012345678` / 해외 치과 → `+국가번호…`(+66 도 그대로). 길이: 국내 9~15자리, 국제 + 뒤 8~15자리
- **전화번호 칸 = 공통 부품 `uiPhoneField`** (ui/layout.js — 회원가입 · `#/complete` · 내 정보 · 등록 정보 변경 요청 · 새 주문 배송 연락처 · 주문 수정, 새 전화 입력도 이것만):
  왼쪽 회색 "[국기] +66 ▾" (직접 입력 안 됨, 누르면 숨은 `<select>` 로 다른 국가번호 — "Thailand (+66)") + 오른쪽 뒷번호(`inputmode="tel"`, 예시 TH "81 234 5678" / 그 밖 `phone_placeholder`).
  국가번호는 **치과 국가를 따라가요** (`uiPhoneSetCountry`, 뒷번호는 그대로). 사람이 다른 국가번호를 고르면 그때부터 안 따라가고(`data-follow="0"`), 치과 국가 번호를 다시 고르면 다시 따라가요.
  붙여넣기(+66812345678 · 0066… · 0812345678)는 국가번호 · 앞의 0 을 정리 (`cncParsePhoneInput`, 이탈리아 +39 만 0 유지). 칸 전체 `dir="ltr"` (ar · fa 에서도 국가번호가 앞).
  읽기: `uiPhoneRaw(id)` = '+66812345678'(검사용) / `uiPhoneValue(id, 치과 국가)` = 저장값(정규화) / 다시 그리기 전 `uiPhoneState(id)` → `uiPhoneField({ state })`. 저장된 번호는 `cncSplitPhone` 으로 두 칸에.
  국가 · 국가번호 표는 `COUNTRY_DIAL` (cnc/cnc-identity.js 한 곳, 모든 나라 — 국가 선택 목록도 이 표). 같은 번호를 여러 나라가 쓰면 `DIAL_PRIMARY` (+1 → US, +7 → RU …, 치과 국가가 먼저)
- 서버 트리거 `_trg_profile_identity` 가 다시 검사: `PHONE_TAKEN` / `PHONE_INVALID` / `TAX_ID_TAKEN` / `TAX_ID_INVALID` / `EMAIL_DISPOSABLE` (일회용 메일 `blocked_email_domains` ↔ `DISPOSABLE_EMAIL_DOMAINS`)
- 중복: 정규화 전화 = 유니크(`profiles_phone_norm_unique`, 기존 중복이 있으면 목록만 출력하고 인덱스는 건너뜀). Tax ID 는 `payment_settings.tax_id_policy` 'block'(기본) / 'allow'(가입 허용, 이벤트는 Tax ID 당 1번). 이름·치과명·주소는 의심 표시만
- 가입 전 확인 `check_signup_available(phone, tax_id, email)` (로그인 전, 겹침 여부 true/false 만 → 다른 사람 정보는 안 보여요)
- **본명 · 올바른 Tax ID 는 처음 채워지면 잠김** → Profile 에서 읽기 전용, 바꾸려면 등록 정보 변경 요청(`request_clinic_change(..., p_full_name, p_tax_id)`, manager 승인)
- 필수 정보가 빈 계정(010 실행 후, `cncNeedsProfileInfo`) → 로그인 직후 `#/complete` (`ui/page-complete.js`) 만 열림 (법적 문서·문의·회사소개는 열림). DB 도 주문 INSERT 때 `PROFILE_INCOMPLETE`.
  010 실행 전(프로필에 full_name 칸이 없음)이면 예전처럼 막지 않음 (`cncHasIdentityColumns`)
- 가입 기록: 첫 로그인 때 `record_signup_meta(device_id, user_agent)` (IP 는 서버가 요청 헤더에서, 기기 ID = `localStorage.allabut_device_id`)
- **신규 가입 이벤트 설정** (Settings, owner): 켜기(기본 꺼짐, 크레딧 0 이면 못 켬) · 이벤트 이름 · 크레딧 · 시작일/종료일(방콕 날짜, `uiDateField`) · 유효기간(일, 365) · 지급 방식 approval(기본)/auto · LINE 필수(기본) · 배너 en/th/ko · Tax ID 규칙. 상태 배지 꺼짐/예정/진행 중/종료 (`cncCampaignStatus`)
- 지급 조건 (`grant_signup_bonus`): 켜짐 + 지금 기간 안 + 가입 시각 기간 안 + 이메일 인증 + (LINE 필수면) LINE 연결 + 사용자·전화·LINE·Tax ID 당 1번. 조건이 아직 안 되면 나중에 다시(로그인 때 `claim_signup_bonus()`, 프로필 변경 트리거)
  - approval: `signup_bonus_grants.status` 'pending' → 관리자 승인(`admin_review_signup_bonus`, 그때 묶음 지급) / 거절(사유 필수) / 회수(`admin_revoke_signup_bonus`, 사유 필수)
  - 목록 `admin_list_signup_bonus(status)` — Customers 탭 맨 위(대기 있을 때) + Settings 이벤트 카드 아래 (manager 이상). 의심 배지(같은 IP · 기기 · 비슷한 치과명 · 주소 · 이름 · Tax ID, `admin_suspicion_flags`)는 목록과 고객 상세에
  - LINE: pending 이 되면 관리자(카테고리 account)에 "🎁 Free credits — approval needed" 카드 (Database Webhook `signup_bonus_grants` Insert·Update)
- 배너: 진행 중이면 랜딩·로그인 화면에 골드 배너 `.campaign-banner` (배너 문구 → 없으면 `campaign_default` + "~ 종료일"), 기간이 끝나면 `get_signup_campaign()` 이 active:false → 자동으로 사라짐
- **비밀번호는 8자 이상** (`PASSWORD_MIN_LENGTH`, cnc/cnc-core.js): 회원가입 · 비밀번호 재설정 · 직원 초대 가입 · 내 정보 비밀번호 변경. **로그인 화면은 길이 검사를 안 해요** (예전 6자 비밀번호 계정도 로그인돼야 해서 — 비어 있는지만).
  Supabase → Authentication → Password 최소 길이도 8 로 맞춰요 (서버에서도 막게)
- **비밀번호 찾기**: 로그인 폼 "비밀번호를 잊으셨나요?" → `#form-reset` (`sendPasswordReset`, redirectTo = `SITE_URL/`) → 메일 링크로 오면 `window.__passwordRecovery` → `#form-newpass` (`updatePassword`) → 로그아웃 후 다시 로그인
- **Cloudflare Turnstile**: `config.js` 의 `TURNSTILE_SITE_KEY` (비어 있으면 위젯 숨김, 예전처럼 동작). 회원가입·로그인·비밀번호 찾기 폼의 `.ts-box[data-ts]` (`ui/turnstile.js`), 토큰은 `captchaToken` 으로 Supabase Auth 에 전달, 호출 뒤 `tsReset`.
  **시크릿 키는 코드에 절대 넣지 않는다** → Supabase → Authentication → Bot and Abuse Protection 에만
- 재실행 순서: 002 → 008 → 009 → 010 → 012 (008 을 다시 실행하면 009 → 010 → 012 도)

## 방문자 집계 (sql/013_site_analytics.sql) — 전부 카운트
- 목적: 나중에 광고 배너 판매용 → **걸러내지 않고 전부 기록** (로봇 · 직원 · 새로고침 포함). 대신 `is_bot` · `is_staff` 를 같이 저장해서 관리자 화면에서 나눠 봐요
- 표 `site_events` (RLS, 직접 읽기·쓰기 없음 → 함수로만): kind 'visit' | 'pageview', 방콕 날짜 `day`, visitor_id · session_id(무작위 UUID), path(쿼리 뺀 경로), referrer_host, device, lang, country(cf-ipcountry), user_id, is_bot, is_staff.
  **IP 원문 · 전체 user agent 는 저장하지 않는다**
- 기록 `log_site_event(...)` (anon·authenticated): user_id · is_staff(`has_admin_role('staff')`) · country 는 서버가 정함, 길이 제한(path·referrer 100자, lang 10자)
- 브라우저 `cnc/cnc-analytics.js` (로직만): visitor_id = `localStorage.allabut_visitor_id`, session_id = `sessionStorage.allabut_session_id`.
  visit = 사이트를 열 때마다 1번 (app.js boot `cncTrackVisit()`), pageview = 경로가 바뀔 때마다 1번 (router + showScreen, 같은 경로 연속은 1번 `cncTrackPage`).
  경로: 랜딩 '/landing', 로그인 화면 '/signin', 나머지 `cncNormPath(location.hash)` (#/orders?id=… → #/orders). is_bot = UA(bot·crawler·spider·preview·headless·lighthouse…) 또는 navigator.webdriver.
  device = UA·폭·터치, referrer = document.referrer 호스트(같은 사이트면 빈 값, LINE 앱 안 브라우저면 'line'). 실패해도 조용히, 화면을 기다리게 하지 않음
- 랜딩 "TODAY 12 · TOTAL 1,234" (`ui/visit-counter.js`, `get_visit_counts()` = visit 전부): 흰 메뉴 줄 아래 다크 본문 오른쪽 위(RTL 왼쪽, 480px 미만 가운데 한 줄),
  숫자 .mono 골드 + 0.8초 카운트업(움직임 줄이기면 바로), 라벨 영어 그대로. 이번 방문이 기록된 뒤에 불러와요. 못 받으면 안 보임
- 관리자 Dashboard "방문 통계" (`ui/page-admin-visits.js`, `admin_visit_stats(from, to, no_bots, no_staff)` staff 이상 — 대시보드 탭 자체는 manager 이상): "현재 현황" 아래 · 월별 통계 위.
  기간(오늘·어제·7일·30일·이번 달·지난달·직접 `uiDateField`) / 카드(방문 · 순 방문자 · 페이지뷰 · 방문당 페이지뷰 · 신규 방문자) / [로봇 제외] [직원 제외] (기본 전부 포함) /
  그래프(날짜별, 하루면 0~23시) / 표(많이 본 화면 `VISIT_PATH_LABELS` · 들어온 곳 `cncReferrerGroups` · 기기 · 언어 · 나라) / 전환(기간 안 가입 수 ÷ 순 방문자) / CSV(owner, BOM)
- **보관 기간 24개월** (sql/014_visit_log_retention.sql): `purge_old_site_events()` 가 `day < 방콕 오늘 - 24개월` 을 지움 (브라우저 권한 없음).
  pg_cron `allabut-purge-site-events` 매일 방콕 01:30 = UTC `30 18 * * *` (기존 01:00 만료 · 01:05 알림과 안 겹침). pg_cron 이 없으면 건너뛰고 notice.
  → 랜딩 TOTAL 도 최근 24개월 합계가 돼요 (2028-11 부터 차이). 개인정보처리방침 "보유 기간"·"쿠키 및 로컬 저장소"에 공개한 내용과 맞춰야 해요 — 보관 기간을 바꾸면 방침 3개 언어도

## 법적 문서 · 동의 (sql/003_legal.sql, 설정 안내: LEGAL_SETUP.md)
- 운영 국가 태국, 태국 PDPA. 치과 = 환자 개인정보 Controller, allAbut = Processor. 환자 데이터(스캔·사진·환자 ID)는 민감정보 — 실명 대신 차트번호 등 가명 ID
- 문서: `#/terms`, `#/privacy`, `#/credit-policy` — **로그인 없이도** 볼 수 있음 (로그인 전: `screen-legal` 화면)
- 본문: `legal/{terms|privacy|credit}.{en|th|ko}.js` (`LEGAL_DOCS['terms.en']`). 영어가 기준, th·ko 번역. 다른 6개 언어는 영어 본문 + 안내.
  본문 배열에서 문자열 = 문단, 배열 = 목록, '{{PRICE_TABLE}}' / '{{REFUND_EXAMPLE}}' = 가격표·환불 예시 (credit_packages 에서 자동)
- 회사 정보는 하드코딩 금지 → `company_settings` 에서 읽어 `{company_name}` 등 자리에 자동 삽입 (비면 [자리표시])
- "초안 · 법률 검토 필요" 표시는 관리자에게만
- **문서는 지금 사이트 기능에 맞춰 쓴다** (2026-11 정리 — 기능을 바꾸면 문서 3종 · 3개 언어도 같이, 그리고 owner 가 새 버전 등록):
  - 이용약관: 상품 두 종류(크라운은 협력 기공소(partner dental laboratory)가 제작할 수 있음, 기공소 이름은 안 씀) · 테스트 서비스 기간 기록 초기화 · 가입 필수 5개 · 등록 정보 잠금 + 변경 요청 승인 ·
    전화 · Tax ID 당 계정 1개(당사가 달리 동의한 경우 제외 — `tax_id_policy` 'allow' 대비) · 부정 가입 시 무료 크레딧 회수 · 납품일은 디자인 승인 때 · 가공 후 취소 불가(고객 · 당사 모두) ·
    하자 통지 "지체 없이, 늦어도 수령 후 14일" + 법이 허용하지 않는 권리 제한 없음 · 책임 한도 예외(사망 · 신체 상해, 고의 · 중과실, 제조물책임법 B.E. 2551) · 환자 데이터 위탁 조항(지시 · 보안 · 재수탁자 · 유출 통지 · 2년 삭제 · 종료 시 삭제/반환)
  - 개인정보처리방침: 본명 · Tax ID(개인 사업자면 개인 식별번호일 수 있음) · 치과 소재 국가 · 문서용 이름/주소/지점(우편 · 택배 업체에 제공, 세법상 5년 보관 — sql/021) · 가입 IP/기기 ID/브라우저 정보(user agent) · 방문 통계 + 배너 노출 · 클릭 / "allAbut 안에서 볼 수 있는 사람"(역할별 · **직원용 LINE 단체방 알림 사본 = 고객 LINE 연결과 상관없이** · 영업 담당은 담당 고객 치과명 + 승인된 입금 금액 · 크레딧 · 날짜) /
    제공 업체(Supabase · Cloudflare(호스팅 · Turnstile · 국가) · Google Fonts · jsDelivr · cdnjs · 인증 이메일 서비스 · LY Corporation(LINE) · 협력 기공소 · 은행 · 운송사) / 국외 이전(싱가포르 · 일본 · 미국 등, PDPA 28 · 29조 계약상 보호 조치) /
    배너(자체 배너 · 외부 광고 네트워크 없음 · 맞춤형 광고 없음) / 권리 행사 30일 + 1회 30일 연장(사유 안내) / 보관 기간 = 아래 "주문 파일 보관 기간" 과 정확히 같게
  - 크레딧 및 환불 정책: 상품 두 종류 · 종류별 가격표 · 환불 "1개 가격" = 같은 종류의 1크레딧 가격(`{single_price}` · 예시는 어버트먼트) · 무료 크레딧 조항 · 테스트 기간 · 세금계산서(태국 · 원본 우편) / 영수증(해외 · 태국 세금계산서 아님) 자동 발행 · 환불 때 크레딧 노트 / 환불 영수증 (sql/021)
  - 로컬 저장소의 방문자 ID(`allabut_visitor_id`) · 기기 ID(`allabut_device_id`), 방문 통계는 누구도 식별 못 하는 합계로만 외부 공유. **수집 항목을 늘리면 방침도 같이 고치고 새 버전 등록**
  - 영문본이 기준, th · ko 는 같은 뜻으로 번역 — **세 언어의 섹션 순서 · 개수 · 목록 모양을 같게** (페이지가 섹션 번호 · 목차를 자동으로 붙이고, 맨 끝에 연락처 섹션을 하나 더 붙여요)
- 버전: `legal_versions` (문서별 최신 = 시행일 → 등록 순, 이름은 날짜 `YYYY-MM-DD`). **새 버전은 코드·SQL 로 자동 추가하지 않는다** (owner 가 관리자 Settings → 법적 버전에서). terms·privacy 최신 버전과 `profiles.terms_version / privacy_version` 이 다르면 전체 화면 재동의 창 (법적 문서·Sign Out 만 가능)
- 가입: 동의 체크 필수 → `accept_legal()`. 충전 결제: Credit & Refund Policy 읽음 체크 필수
- 계정 삭제: Profile → `request_account_deletion()` → 관리자 Customers 탭에서 처리 (실제 삭제는 Supabase 대시보드에서 수동)
- 모든 화면 아래 푸터: 문의 줄("문의: 이메일 · LINE @id") + Terms · Privacy · Credit & Refund Policy · © 2026 회사명 (`renderFooters()`)

## 문의 연락처 (#/contact)
- 연락처는 하드코딩 금지 → `company_settings` 의 email · dpo_email · line_id · phone (+ company_name · address) 를 `cncContactInfo()` 로 읽어요.
  비어 있는 항목은 숨김, line_id 만 비면 기본 `@925caqxb` (`DEFAULT_CONTACT_LINE_ID`). 메일 주소는 `cncMailto(email, 제목)`, LINE 은 `cncLineUrl(id)`
- `#/contact` (`ui/page-contact.js`) — 로그인 없이도 열림 (법적 문서처럼 screen-legal). 카드 3개: 📧 일반(email) / 💬 LINE(친구추가 + PC QR) / 🔒 개인정보(dpo_email), 주문번호 안내·답변 시간, 회사 정보
- 들어가는 곳: 푸터 문의 줄, 헤더 ☰ 메뉴 "문의하기", 가이드 맨 아래 버튼, 주요 에러 아래 `uiContactHelpHtml()` ("문제가 계속되면 문의하기"),
  내 주문 상세 맨 아래 "이 주문 문의하기" (mailto, 제목 `contact_order_subject` = "[주문번호] 문의")
- 답변 시간 문구(`contact_note_hours`)는 실제 운영 시간에 맞게 9개 언어 파일에서 고쳐요

## 회사소개 (#/about, sql/007_company_profile.sql)
- `ui/page-about.js` — 로그인 없이도 열림 (screen-legal). 로그인 상태면 앱 화면 안에서. 최대 너비 1120px, Hero 만 다크(#06090f→#001D4A) + 치수선 장식
- 순서: Hero → 01 About → 02 Why allAbut(강점 5개, 선 아이콘 SVG `ABOUT_ICONS` — 인증 칩 없음) → 03 Products(`ABOUT_PRODUCTS`, img 를 채우면 사진 자리 생김) → 04 How to order(`wiz_step1~5` 재사용) → 05 Delivery & guarantee → 06 Manufacturer(제조사 이름이 있을 때만, sql/026) → 07 Contact
- 섹션 번호 01~ 은 보이는 섹션만 순서대로. 값이 빈 줄·칩·섹션은 숨김
- 규격 글자(`ABOUT_SPEC_TOKENS`: <5μm, 5μm, ASTM F136, Grade 23, Ti-6Al-4V ELI, ISO 13485)는 번역문 안에서 찾아 Mono 골드(긴 것부터 한 번에 — `specHtml`) → **번역할 때 이 글자는 그대로 둔다**
- 제조사 값(이름 · 주소 · 인증 · 태국 FDA 제조 허가)은 `cncManufacturerInfo()` — 위 "규칙"의 판매 / 제조 표기
- 회사 값은 `company_settings` 만 (`cncCompanyProfile(lang)`): founded_year, implant_brands(쉼표), lead_time·delivery·remake_policy (jsonb `{en, th, ko, ...}`, 지금 언어 → en 순으로, `cncLocalizedText`)
- 관리자 Settings → Company info 아래 "About page" 칸 (en/th/ko 입력, 다른 언어 값은 저장할 때 보존). 007 실행 전이면 안내만 보이고 기존 칸 저장은 그대로 동작 (`cncHasCompanyProfile()`)
- SEO: 페이지가 열려 있는 동안 title·description·og 태그(언어별, og:url 은 `SITE_URL`) + JSON-LD Organization, 떠나면 원래대로
- 스크롤 등장 애니메이션은 IntersectionObserver + `.about-animate` (prefers-reduced-motion 이면 안 붙임)
- 들어가는 곳: PC 위쪽 메뉴 줄 "홈" 바로 오른쪽(`NAV_ITEMS` 의 about, `noTab`), 모바일은 ☰ 메뉴 맨 위 첫 항목(하단 탭에는 없음, PC 에서 fit-7 로 아래 탭을 쓸 때만 탭에도),
  랜딩 상단 메뉴 줄(로고 · 회사소개 · 언어 · 로그인), 로그인 전 헤더(로고 옆), 푸터 맨 앞 "About".
  #/about 이면 메뉴가 굵게 + 골드 밑줄 (`setActiveNav`, 로그인 전 화면도). 좁은 화면(420px 미만)은 로고 · 회사소개 · 로그인 한 줄 + 언어 선택은 둘째 줄

## 매출 대시보드 (sql/004_finance.sql, 설정 안내: FINANCE_SETUP.md)
- Admin → Dashboard 순서: ⓪ (owner) 작은 요약 "이번 달 입금 합계 · 지난달 대비"(▲▼ %, `admin_finance_trend` 마지막 두 달) + [매출 보기](이번 달 + 매출 탭으로 바꾸고 스크롤, `goRevenue`)
  → ① "지금 처리할 일" (대기 중 충전 요청 / 접수 대기 주문 / 기한 임박 — 누르면 그 탭·필터로)
  → ② "현재 현황" (단계별 카드, 기한 임박 목록) → ②-1 방문 통계(**기본 접힘**: 제목 + 오늘 방문 수 + [펼치기], 펼침 상태 `localStorage.allabut_dash_visits_open`)
  → ③ 구분선 + ◀ 월 ▶ + "월별 통계" ([주문 | 매출] 탭 전환, 매출은 owner 만 — 선택은 `localStorage.allabut_dash_zone` 에 기억)
- 섹션 제목은 얇은 글자 + 아래 골드 선 (`.dash-section-title`), 전환은 밑줄 탭 (`.dash-tab`)
- 집계는 DB 함수만 (관리자 전용, 방콕 시간 기준 달, month 는 1~12): `admin_finance_month`, `admin_finance_trend`, `admin_outstanding_credits`, `admin_topups_export`
- 입금 = 승인일(reviewed_at) 기준 VAT 포함 total. 사용 가치 = `credit_lot_usage`(restored_at 없음) × 묶음 unit_price (VAT 별도)
- 현금 환불 금액은 `credit_history.amount_thb` (004 에서 추가, `admin_refund_cash` 가 저장)
- 002 를 다시 실행하면 004 도 다시 실행 (admin_refund_cash 가 예전 모양으로 돌아가서) → 그 다음 005 → 016 도 (권한 · 묶음별 환불 기록)
- CSV: UTF-8 BOM, 금액은 쉼표 없는 숫자, Tax ID 는 `="..."`, 수식 주입 방지(' 붙임), 파일명 `allabut-topups-YYYY-MM.csv`

## 세금계산서 · 영수증 · 치과 소재 국가 (sql/021_tax_invoices.sql, 설정 안내: TAX_SETUP.md)
- **국가**: `profiles.country`(ISO 2글자, 기본 'TH') + `reg_country`(등록 정보가 잠길 때 같이 정해지고 잠김, 트리거 `trg_profile_country`). 바꾸려면 등록 정보 변경 요청(`clinic_change_requests.country`) → 관리자 승인.
  예전 계정 = 'TH'. 가입 · `#/complete` 에 "치과 소재 국가" 선택 (태국 맨 위, 이름은 `Intl.DisplayNames` 로 지금 언어 — `cncCountryOptions`)
  - 태국 아님: Tax ID 선택("Tax / VAT ID (optional)", 영문 · 숫자 · 하이픈 5~30, 있을 때만 중복 검사), 전화는 국제 형식(국가번호 칸이 자동으로 붙여요 — 아래 "전화번호 칸"), 필수 정보에서 Tax ID 빠짐
  - 태국: 지금 규칙 그대로 (13자리 체크섬 · +66 → 0). **SQL `_norm_phone(p, country)` · `_norm_tax_id(p, country)` 와 JS `cncNormPhone(v, country)` · `cncNormTaxId(v, country)` 는 같은 규칙** (하나를 고치면 둘 다)
  - 관리자 Customers: 국가 칸 + 전체 / 태국 / 해외 필터 (의심 배지 규칙은 그대로)
- **문서 종류는 승인 시점의 `reg_country` 로만**: TH → 세금계산서(`invoice`, IV) / 그 밖 → 영수증(`receipt`, RC). 현금 환불 → 크레딧 노트(`credit_note`, CN) / 환불 영수증(`receipt_refund`, RF)
- 표 `tax_invoices` (번호 = 접두어 + YYMM + "-" + 4자리, 달마다 0001 부터, 빈 번호 없음 — `tax_doc_counters` 줄 잠금) · 판매자 · 구매자 정보는 **발행 때 그대로 복사(스냅샷)**.
  **발행된 문서는 못 바꿔요** (트리거 `trg_tax_invoice_lock` → `DOC_IMMUTABLE`, 우편 칸만 `admin_mark_invoices_mailed` 가). 정정은 크레딧 노트 / 환불 영수증으로만. 예전 `invoices` 표는 안 씀 (고객 insert 정책만 지움)
- 자동 발행: 충전 승인 (`topup_requests` status → approved 트리거 `trg_topup_issue_doc`) / 현금 환불 (`refund_cash_lots` insert 트리거 `trg_refund_issue_doc`). **기존 승인 · 환불 함수는 다시 정의하지 않음**,
  발행 오류가 승인 · 환불을 막지 않음 (warning 만). 무료 크레딧은 문서 없음. 설정이 꺼져 있었으면 관리자 [발행] (`admin_issue_tax_doc` — 발행일 = 그날, 원래 승인일도 문서에)
- 판매자 설정 (`company_settings`, owner): `vat_registered` · `seller_name_th/en` · `seller_address_th/en` · `tax_id` · `seller_branch`('' = สำนักงานใหญ่ / 5자리) · `mail_cycle`(안내 글만).
  세금계산서는 VAT 등록 + 태국어 이름 · 주소 + 올바른 Tax ID 가 있어야 (`_tax_invoice_ready`), 영수증은 영어 이름 · 주소(없으면 회사 이름 · 주소)
- 해외 VAT: `payment_settings.overseas_vat_mode` 'charge'(기본, 같은 VAT %) | 'zero' → `create_topup_request` 가 고객 등록 국가로 정해 `topup_requests.vat_rate` 저장. 충전 화면 · QR 금액 = `get_my_vat_rate()`,
  환불 계산 = 충전마다 `vat_rate`. 화면 안내 "해외 고객의 VAT 는 회계사와 확인한 뒤 정하세요"
- 고객 문서 정보 (`profiles.doc_name` · `doc_address` · `doc_branch`, 내 정보에서 고객이 수정 — 이미 발행된 문서는 안 바뀜). 비어 있으면 등록 치과명 · 주소로
- 화면: 고객 내 정보 "🧾 세금계산서 · 영수증"(해외 = "영수증", `ui/profile-docs.js`, 월별 ◀ ▶ · 합계 · 이 달 전체 출력 · 우편 상태 · 환불 문서 빨강, `#/profile?docs` 로 바로) ·
  충전 내역의 [세금계산서] / [영수증] 버튼. **고객이 출력한 세금계산서 = 확인용 워터마크 "สำเนาเพื่อตรวจสอบ / For reference"** (정식 원본은 우편), 고객이 출력한 영수증 = 정식 사본
- A4 출력 (`ui/tax-doc.js` `TaxDoc.open(docs, { mode })`): 세금계산서 = 태국어 먼저 + 작은 영어 (86/4 필수 내용 · 바트 글씨 `cncBahtText` · ต้นฉบับ / สำเนา · เอกสารออกเป็นชุด · 서명 · 도장 자리),
  영수증 = 영어만 ("tax invoice" 라는 말 금지, 맨 아래 "This receipt is not a Thai tax invoice.", VAT 0% 면 "VAT 0%"). 주소 라벨 = A4 라벨지 8칸 / 창봉투
- 관리자 "세금계산서" 탭 (`ui/page-admin-tax.js`, manager 이상 · 보고서와 설정은 owner): 문서 목록(달 · 검색 · 종류 · 우편 필터, [원본] [사본] [둘 다] / 영수증 [출력]) · 우편 발송(고객 + 달 묶음 · 원본 한꺼번에 · 라벨 · 발송 완료 표시) ·
  미발행 충전 [발행] · 매출 세금 보고서 + 해외 매출 (출력 · CSV BOM · Tax ID `="…"`) · 설정. 대시보드 "지금 처리할 일"에 우편 발송 대기 수. 충전 상세에서 문서 바로 열기
- LINE: 충전 승인 카드(고객 · 사본)에 "Tax invoice / Receipt + 번호 + 안내"(9개 언어) · 버튼은 하나(문서가 있으면 `#/profile?docs`). 현금 환불 카드(`refund_cash`, 새로 생김)에 문서 번호 한 줄. **우편 발송 표시는 LINE 안 보냄**
- 작업 기록: 'tax_doc_issued' · 'invoices_mailed'. RLS: 고객 = 자기 문서 읽기, manager 이상 = 전부 읽기, 쓰기는 함수만. `launch_reset.sql` 지울 표에 `tax_invoices` · `tax_doc_counters` (번호 1부터 다시)
- **문서가 있는 고객은 프로필 삭제가 막혀요** (충전 FK restrict → 세법상 5년 보관, 개인정보처리방침에도 씀)

## 제외 (나중에)
- 카드·온라인 자동 결제

## 스택
- Vanilla JS, HTML / CSS (Tailwind 는 쓰지 않음 — 직접 만든 CSS)
- Supabase (CDN, `@supabase/supabase-js@2.45.4` 고정): Auth, DB, Storage
- Three.js `three@0.160.0` — 파일 뷰어를 **열 때만** 동적으로 불러옴

## 파일 구조 (로직과 화면 분리)
- `index.html` — 화면 틀 3개 (landing / auth / app), 스크립트 순서
- `config.js` — Supabase 주소·공개 키, 사이트 주소 `SITE_URL`, 디자인 스위치 `SITE_THEME`('navy' | 'mono' | 'classic') · mono/navy 랜딩 사진 `LANDING_IMAGE` (index.html <head> 에서 읽어요)
- `theme.js` — 디자인 스위치 적용 (`<html data-site-theme>` · mono 의 theme-color · `logo-mono`, `cncSiteTheme()` · `cncIsMono()` · `cncIsNavy()`),
  `css/theme-mono.css` · `ui/landing-mono.js` — 흑백 미니멀 (mono 일 때만), `css/theme-navy.css` · `ui/landing-navy.js` — 네이비 스플릿 로그인 전 화면 (navy 일 때만)
- `loader.js` — 필요할 때 불러오기: `cncAssetQuery()` · `cncLoadScript(path)` · `cncWithin(promise, ms)` · 관리자 화면 목록 `STAFF_SCRIPTS` · `cncLoadStaffScripts()` · `cncStaffScriptsReady()` (위 "첫 접속을 가볍게")
- `build.sh`, `404.html`, `_redirects`, `_headers` — Cloudflare Pages 배포용 (위 "배포 · 도메인")
- `favicon.ico` · `robots.txt` · `sitemap.xml` · `site.webmanifest` — 검색 · 공유용 맨 위 파일 (위 "검색 · 링크 공유"), `assets/brand/` — 파비콘 · 공유 이미지 · LINE 카드 아이콘
- `tools/brand/make_brand_assets.py` · `tools/brand/render.js` — 파비콘 · 공유 이미지 · 미리보기 만들기 (배포 안 됨), `docs/favicon-preview.png` — 작은 크기 미리보기 (배포 안 됨)
- `lang.js` — `t()`, `tf('키', {n:3})`, `setLang()`(필요하면 파일을 받은 뒤), `cncLoadLang` · `cncLoadLangWithin`, RTL 처리, 날짜·숫자 표시 (`formatDate` · `formatDateTime` · `formatTime` 시각만)
- `lang/lang-en.js ~ lang-fa.js` — 9개 언어 (키 이름은 모두 같음, 영어만 처음에 · 나머지는 그 언어를 쓸 때 받아요). 위쪽은 allAbut 문구, 아래쪽은 Dentalk 에서 가져온 CNC 문구
- `auth.js` — 회원가입(본명 · 전화 · 치과명 · Tax ID · 주소 필수, captchaToken) / 로그인 / 비밀번호 재설정 / `getProfile()` + 로그인 저장소 `AUTH_STORAGE`(고객 localStorage · 직원 sessionStorage)
- `cnc/cnc-identity.js` — 필수 정보 정규화·검사(전화 · Tax ID 체크섬 · 일회용 메일), 가입 전 확인, 기기 ID, 가입 기록, 신규 가입 이벤트 안내 (로직만)
- `ui/turnstile.js` — Cloudflare Turnstile 위젯 (키가 있을 때만)
- `cnc/cnc-analytics.js` — 방문 · 페이지뷰 기록, 방문자 ID, 기기·로봇·들어온 곳 판별, TODAY/TOTAL, 관리자 방문 통계·CSV (로직만)
- `ui/visit-counter.js` — 랜딩 "TODAY · TOTAL" 숫자
- `cnc/cnc-service.js` — 서비스 상태 (테스트 / 정식) 읽기 · 바꾸기 (로직만, sql/017)
- `ui/service-badge.js` — 로고 옆 "TEST" 배지 · 슬로건 옆 "Beta test service" · 설명 팝오버
- `ui/page-admin-visits.js` — 관리자 Dashboard 방문 통계 (`PageAdmin` 에 덧붙임)
- `cnc/cnc-ads.js` — 광고 배너 읽기 · 노출/클릭 기록 · 관리자 저장/삭제/이미지 올리기 · 통계 · CSV (로직만, sql/019)
- `ui/ad-banner.js` — 광고 배너 자리 (랜딩 · 홈 · 주문 완료, 회전 · 노출 1번)
- `ui/back-to-top.js` — "↑ 맨 위로" 버튼 (`BackToTop`, 모든 화면 공통 하나, 아래 "화면 공통 부품")
- `ui/page-admin-ads.js` — Settings "📢 광고 배너" 섹션 + Dashboard 광고 카드 (`PageAdmin` 에 덧붙임)
- `cnc/cnc-retention.js` — 주문 파일 보관 기간: 지운 주문 판단(`cncOrderFilesPurged`) · 환자 표시(`cncPatientLabel`) · 관리자 설정 · 지금 실행 (로직만, sql/020)
- `ui/page-admin-retention.js` — Settings "🗂 주문 파일 보관 기간" 카드 (owner, `PageAdmin` 에 덧붙임)
- `supabase/functions/data-retention/index.ts` — 매일 새벽 주문 파일 삭제 Edge Function (서비스 키 · `x-notify-secret`, 설정 안내 `RETENTION_SETUP.md`)
- `cnc/cnc-tax.js` — 세금계산서 · 영수증 로직: 태국어 금액 글씨(`cncBahtText`) · 달 이동 · 합계 · 내 문서 · 관리자 목록/발행/우편/보고서 · CSV · 판매자 설정 (로직만, sql/021)
- `ui/tax-doc.js` — A4 출력 (`TaxDoc.open` 원본/사본/둘 다/확인용 · `TaxDoc.labels` 주소 라벨)
- `ui/profile-docs.js` — 내 정보 "🧾 세금계산서 · 영수증" 섹션 (`ProfileDocs.mount`)
- `ui/page-admin-tax.js` — 관리자 "세금계산서" 탭 + 충전 상세의 문서 줄 (`PageAdmin` 에 덧붙임)
- 국가 공통 (sql/021, cnc/cnc-identity.js): `COUNTRY_DIAL`(국가번호 표) · `COUNTRY_CODES` · `cncNormCountry` · `cncIsThai` · `cncCountryName` · `cncCountryOptions`(label "Thailand (+66)") · `cncProfileCountry` · `cncNormBranch` · `cncValidBranch`
- 전화번호 칸 (sql/022): 로직 `cncDialCode` · `cncCountryFlag` · `cncDialCountry` · `cncParsePhoneInput` · `cncSplitPhone` · `cncComposePhone` (cnc/cnc-identity.js), 화면 `uiPhoneField` · `uiPhoneRaw` · `uiPhoneValue` · `uiPhoneState` · `uiPhoneSetCountry` · `uiPhoneSetInvalid` (ui/layout.js)
- 상품 종류 공통 (sql/018): 로직 `CNC_PRODUCTS` · `cncProductOf` · `cncProductCounts` · `cncOrderProductCounts` · `cncPackagesFor` · `cncHasProducts` (cnc/cnc-core.js),
  화면 `uiProductName` · `uiProductBadge` · `uiProductCountsHtml` · `uiProductCreditsHtml` · `cncProductCredits` · `cncShowCrownSet` (ui/layout.js)
- `ui/logo-intro.js` — 랜딩 큰 로고(`.logo-hero`) 불꽃 인트로 (페이지를 열 때마다 1번 · 새로고침 포함, `LogoIntro.maybePlay()` / `stop()`)
- `ui/page-complete.js` — 필수 정보 입력 `#/complete`
- `session.js` — 로그인 시간 제한: 고객 = 1시간 세션 + 연장(최대 3시간) + 5분 전 경고 / 직원 = 자리 비움 30분 (아래 "로그인 유지 규칙"). 로그아웃돼도 작성 중 주문은 유지
- `app.js` — `APP { user, profile, balance }`, 화면 전환, 로그인 폼, 시작(boot)
- `cnc/cnc-data.js` — 브랜드 11종, VITA 14색, 주문 단계, FDI 32개, `getToothName()`, 파일 규칙
- `cnc/cnc-core.js` — 화면 코드 없는 순수 로직: draft 저장/복원, 단계별 검사, 파일 규칙, cases 만들기, 업로드, 제출(RPC), 주문 조회, 고객 액션, 크레딧, 프로필 저장
- `cnc/cnc-viewer.js` — 파일 뷰어 (STL·OBJ 3D, 이미지, PDF), 서명 URL. 3D 조작은 아래 "3D 파일 뷰어"
- `ui/layout.js` — 헤더, 모바일 하단 탭, 공통 부품 (`escHtml`, 토스트, 모달, 확인창, 에러 글씨, 상태 배지, 진행 막대), 헤더 자동 맞춤 `fitHeader()`
- `ui/line-connect.js` — LINE 연결 공통 부품 (헤더 버튼, 안내 띠, 연결 모달·자동 확인, Profile 섹션, 완료 카드, QR 라이브러리)
- `ui/router.js` — 해시 라우팅 `#/home`, `#/guide`, `#/new`, `#/orders`, `#/profile`, `#/topup`, `#/admin`, `#/terms`, `#/privacy`, `#/credit-policy`, `#/contact`, `#/about`, `#/complete`(필수 정보가 비었을 때만) (새로고침해도 같은 페이지). 로그인 없이 열리는 곳은 `isPublicRoute()` (법적 문서 + contact + about + join)
- `ui/datepicker.js` — 자체 달력 `uiDateField({ id, value, min, onChange })` / `uiDateValue(id)`. 앱의 모든 날짜 입력은 이것만 쓴다 (`<input type="date">` 금지: 브라우저 언어를 따라가서)
- `cnc/cnc-legal.js` — 법적 문서 불러오기·버전·동의·회사 정보·삭제 요청 (로직만)
- `ui/page-legal.js` — 법적 문서 페이지 (목차, 섹션 번호, 버전·시행일, 연락처, 인쇄)
- `ui/page-contact.js` — 문의하기 `#/contact` (로그인 전·후 공통, 연락처는 company_settings)
- `ui/page-about.js` — 회사소개 `#/about` (로그인 전·후 공통, 회사 값은 company_settings)
- `cnc/promptpay.js` — PromptPay QR 페이로드(EMVCo + CRC16), `promptPayPayload(id, amount)`
- `ui/page-topup.js` — 크레딧 충전 `#/topup` (패키지 → QR·계좌 → 슬립 → 완료, 내 충전 내역)
- `ui/page-guide.js` — 사용 매뉴얼 `#/guide` (문구 `guide_...`, 새 주문 "? Help" 팝오버도 `guide_stepN_text` 재사용). 내용은 지금 기능과 같게:
  시작하기 = 가입 때 넣은 등록된 치과 정보(바꾸려면 내 정보에서 변경 요청 → 승인) / 크레딧 = 두 종류(서로 못 바꿔 씀) · 충전 순서 4단계(`guide_topup_step1~4`, 패키지 → PromptPay QR · 계좌이체 → 슬립 → 승인) · 12개월 · 무료 크레딧은 등록 주소 배송 전용 + [충전 화면 열기] /
  진행 단계 아래 파일 2년 보관 문장(`guide_flow_retention`) / FAQ = 로그아웃 · 작성 중 주문 · 파일 · **LINE 연결(6)** · **3D 미리보기 조작(7)** · 글자 크기 · 언어 + **테스트 서비스 안내(8, service_mode 'test' 일 때만 맨 앞, `cncIsTestMode()`)**
- `ui/page-home.js`, `ui/page-new.js`, `ui/page-orders.js`, `ui/page-profile.js`
- `cnc/cnc-admin.js` — 관리자 로직 (화면 코드 없음): 대시보드 집계, 주문 목록·상세, 단계 처리, 디자인 업로드, 배송, 취소·환불, 고객·크레딧
- `ui/page-admin.js` — 관리자 화면 `#/admin/orders`, `#/admin/topups`, `#/admin/customers`, `#/admin/dashboard`, `#/admin/activity`, `#/admin/team`, `#/admin/commission`, `#/admin/settings`, `#/admin/sales` (역할에 따라 보이는 탭이 달라요)
- `cnc/cnc-finance.js` — 매출 집계 RPC 호출, CSV 만들기·내려받기 (로직만)
- `ui/page-admin-finance.js` — Dashboard 의 Revenue 구역 (`PageAdmin` 에 함수 덧붙임: 카드, ? 설명, 패키지 표, 상위 고객, SVG 그래프, CSV 버튼)
- `cnc/cnc-team.js` — 역할(`cncHasRole`, `cncLoadAdminMe`), 팀 관리, 작업 기록 조회(역할별 묶음 `cncAuditGroupsForRole`), 제작 직원 "내 작업"(`cncMyWork` · `cncMyWorkFrom` · `cncGroupMyWork`), 관리자 LINE 그룹·그룹 코드 (로직만)
- `ui/page-admin-team.js` — Team 탭, Activity 탭(owner · manager), 내 작업 탭(제작 직원), Settings 의 LINE groups 섹션 (`PageAdmin` 에 덧붙임)
- `cnc/cnc-sales.js` — 영업 담당 목록 · 요율 · 입금/고객 담당자 지정 · 수금 기준 커미션 결과 · 정산 · CSV (로직만, sql/015 · 016)
- `ui/page-admin-sales.js` — 영업 탭 · 커미션 탭 · Top-ups/고객 담당 칸 · Team 의 영업 담당 스위치 · 커미션 설정 (`PageAdmin` 에 덧붙임)
- `cnc/cnc-staff.js` — 직원 계정 로직 (sql/023): 직원 판별(`cncIsStaffAccount`) · 상태(`cncStaffStatus` · `cncStaffBlocked`) · 역할 첫 화면(`cncStaffStartRoute`) · 고객 전용 주소(`cncIsCustomerOnlyRoute`) ·
  초대 링크(`cncInviteLink` · `cncCheckStaffInvite` · `cncStaffSignUp` · `cncValidateStaffJoin`) · 대표 직원 메뉴 함수 · 영업 화면 데이터(`cncSalesSummary` · `cncSalesClients` · `cncSalesClientOrders` · `cncSalesPendingTopups` · `cncSalesRevenue`). cnc-sales.js 다음에 불러와요
- `ui/page-join.js` — 초대 링크 가입 `#/join?t=…` (`PageJoin`, 로그인 없이) + 직원 대기 · 정지 안내 (`PageStaffGate`, `#/staffgate`)
- `ui/page-sales.js` — 영업 화면 (`PageAdmin` 에 덧붙임, sql/024): **"내 실적" 한 화면**(`#/admin/sales` — 큰 커미션 카드 · 내 고객 결제 · 내 고객 주문 · 접이식 지난 12개월) + 내 거래처 + 역할별 접는 도움말 (`staffHelpHtml`)
- `ui/page-admin-staff.js` — 대표 "직원" 메뉴 (Team 탭을 바꿔 끼움, 023 전이면 예전 Team 화면): 직원 목록 · 초대 링크 · 정지/다시 켜기 · 거래처 옮기기 · 직원 계정 전환
- `ui/page-admin-free.js` — 무료 크레딧 사용 배지, 무료 크레딧 지급·회수, 신규 가입 이벤트 설정, 등록 치과 정보 변경 요청 승인 (`PageAdmin` 에 덧붙임, sql/008·009)
- `css/landing.css` (공통 변수 + 랜딩·로그인·세션 팝업), `css/app.css` (앱 화면)

## 3D 파일 뷰어 (cnc/cnc-viewer.js — 고객 · 관리자 화면 공통 `cncOpenViewer`)
- 쓰는 곳: 새 주문 4단계 파일 미리보기(File), 내 주문 상세 · 관리자 주문 상세의 주문 파일 · 디자인 파일(서명 URL). 전부 같은 `cncOpenViewer` → 한 곳만 고치면 같이 바뀌어요
- **오비트 방식**: 모델은 가만히, 카메라가 모델 중심(target)을 돌아요 (예전처럼 mesh 를 Euler 로 돌리지 않음 → 방향이 안 꼬임).
  three@0.160.0 의 OrbitControls 는 ES 모듈뿐이라 three.min.js 와 같이 쓰면 Three.js 를 두 벌 받아야 해서, **같은 동작을 파일 안에 직접 구현** (`_orbit*`, 추가 다운로드 없음)
  - 회전: 왼쪽 드래그 / 한 손가락, 100px ≈ 20° (`VIEWER_ROTATE_PER_PX`, 예전 0.01rad/px 의 약 1/3), 위아래 ±85° (`VIEWER_MAX_ELEVATION`)
  - 이동: 오른쪽 · 가운데 버튼 드래그, Shift+드래그 / 두 손가락. 모델이 커서를 그대로 따라와요
  - 확대·축소: 휠 한 칸 5% (`VIEWER_WHEEL_STEP`, 마우스 위치 쪽으로) / 두 손가락 핀치(손가락 가운데 쪽으로), 거리 = 모델 크기 × 0.6 ~ 6 (`VIEWER_MIN_DIST` · `VIEWER_MAX_DIST`), 처음 × 1.8
  - 관성 `VIEWER_DAMPING` 0.08 (손을 떼면 짧게 미끄러지다 멈춤), **prefers-reduced-motion 이면 관성 · 애니메이션 없음**
  - 더블클릭 · 더블탭(400ms 안 · 30px 안) = 처음 보기. 캔버스 `touch-action: none` + touchstart/touchmove preventDefault → 뷰어 안 터치로 페이지가 스크롤 · 확대되지 않아요
- 보기 버튼 줄 `.viewer-tools` (3D 일 때만, 글자 라벨, 높이 48px, 600px 미만은 4개씩 두 줄): [정면] [옆] [위] [아래] [처음으로] [＋ 확대] [－ 축소]
  → `cncViewerSetView('front'|'side'|'top'|'bottom'|'reset')` · `cncViewerZoom(factor)` 0.4초 부드럽게 (`VIEWER_ANIM_MS`, 움직임 줄이기면 바로). 위 · 아래 = ±85°.
  처음 보기 = 정면에서 20° 위 (`VIEWER_DEFAULT_ELEVATION`). 문구 `viewer_view_*` · `viewer_zoom_*` · `viewer_tools_aria` · `stl_viewer_hint`(마우스) · `viewer_hint_touch`(터치, `pointer: coarse`) 9개 언어
- 방향: 치과 CAD 파일은 Z 축이 위(삽입 방향)라서 **파일의 Z 축을 화면 위로 세워** 보여줘요 (`geometry.rotateX(-π/2)`)
- 조명: 환경광 + 카메라에 붙은 메인(위) · 테두리(뒤) · 약한 보조(아래) → 어느 방향에서 봐도 보는 쪽이 밝아요. 바닥에 옅은 그림자 원(아래에서 볼 땐 숨김)
- **필요할 때만 그리기**: 움직이는 동안(드래그 · 관성 · 버튼 애니메이션 · 크기 변경)만 requestAnimationFrame, 멈추면 쉬어요 (`_viewerRequestRender`). 법선이 0 인 STL 은 직접 계산
- 닫기 · 다른 파일 열기 = `_viewerCleanup()`: 그리기 멈춤, 캔버스 이벤트 전부 떼기(`_viewerOn` 으로 붙인 것), ResizeObserver 끊기, geometry · material · 그림자 텍스처 · renderer dispose, File 임시 주소 해제

## 화면 공통 부품 (디자인)
- 단계 색은 `ui/layout.js` 의 `STAGE_COLORS` 한 곳 → `uiStageBadge(stage)` (홈·내 주문·관리자 공통), `uiStageStyle(stage)` (관리자 단계 카드 등)
- 내 주문 카드: 윗줄 주문번호(Mono) · 배지 / 둘째 줄 환자 · 치아 수 · 납기 · 접수일 / 얇은 진행 줄 `uiStageProgress(stage)` + "현재: … (3/7)".
  큰 7단계 진행 막대 `uiStageBar` 는 펼친 상세 안에만. 고객 할 일(디자인 확인·수령 확인, `cncOrderNeedsAction`)은 골드 세로줄 + "다음 할 일" + 바로가기
- 진행 중 목록은 한 번에 모두 가져와 `cncSortProgress` (할 일 있는 주문 → 납기 있는 것 빠른 순 → 납기 없는 것 접수일 순)
- 홈 맨 위 "확인이 필요해요" (골드 테두리, `cncOrdersNeedingAction`), 크레딧 카드 "n크레딧이 m일 후 만료" (`cncExpiringSummary`)
- 치아 선택(Step 2): 치아 모양 SVG 버튼 3종 (1~3 앞니 / 4~5 작은어금니 / 6~8 큰어금니), 위턱 뿌리 위·번호 아래, 아래턱 반대.
  넓은 칸(600px 이상)은 한 턱 한 줄 + 아치(가운데가 앞으로), 좁으면 사분면마다 한 줄(8개). 선택 = 네이비 채움 + 흰 테두리 + ✓, 호버 = 골드 테두리.
  `tooth-btn` + `onclick="PageNew.toggleTooth(n)"` 은 그대로 (테스트·포커스 유지가 이것을 써요)
- 새 주문 3단(PC): 단계 목록 · 입력 카드 · 요약 카드의 윗선이 같게 (`.wizard > * { margin-top: 0 }`), 요약 카드는 sticky
- 충전 패키지 선택 버튼: 기본 흰 바탕 + 네이비 테두리, 호버·Popular·Best value 카드만 네이비 채움
- **"↑ 맨 위로" 버튼** `ui/back-to-top.js` (`BackToTop`) + css/app.css `.back-to-top` — 한 번만 만들어 `<body>` 에 붙이고 랜딩 · 로그인 · 회사소개 · 문의 · 법적 문서 · 고객 앱 · 관리자 · 영업 화면 전부 같이 써요
  - 모양: 알약 "↑ 맨 위로" (글자 라벨 `back_to_top`, aria-label `back_to_top_aria`, 9개 언어), 높이 3.25rem(52px, 글자 크기 A+ · A++ 따라 커짐) · 글자 1rem,
    네이비 + 흰 글씨 + 얇은 골드 테두리 + 그림자 / 다크 화면(랜딩 · 로그인 — body 에 `in-app` 이 없을 때 `.on-dark`)은 골드 배경 + 네이비 글씨 + 흰 테두리. 호버 · 키보드 포커스(파란 3px 테두리) 분명하게
  - 위치: 오른쪽 아래 고정(RTL 은 왼쪽 아래, `inset-inline-end`), 여백 20px + safe-area. z-index 90 (하단 탭 60 · 새 주문 버튼 줄 55 위, 모달 · 뷰어 · 토스트 300~ 아래)
  - 피하기: `OBSTACLES`(휴대폰 하단 탭 `.app-tabbar` · 새 주문 버튼 줄 `.wiz-bottom-bar` · 랜딩 고정 푸터 `.public-footer` · 토스트) 중 버튼과 가로로 겹치고 position:fixed 인 것의 **실제 위치**를 읽어 그 위 12px 로 (`--btt-bottom`)
  - 버튼이 보이는 동안 `<html class="btt-room">` → 앱 푸터 · 로그인 화면 푸터 아래에 버튼 높이만큼 여백(`--btt-room`) → 맨 끝까지 내려도 푸터 링크가 가려지지 않아요 (토스트 때문에 잠깐 올라간 위치는 여백 계산에 안 씀)
  - 동작: 스크롤이 화면 높이 1배 이상이면 나타남(페이드 + 12px 올라오기), 위면 숨김(visibility hidden + tabindex -1 + aria-hidden). 스크롤이 없는 짧은 화면은 안 나타나요.
    누르면 맨 위로 부드럽게(움직임 줄이기면 바로) → 도착하면 그 화면 맨 위 제목(h1 · h2 · `.wiz-title`, 헤더 안 제외) / 로그인 화면은 선택된 탭 / 없으면 main 에 포커스(`preventScroll`)
  - 숨김: `BLOCKERS` (모달 · 확인창 `#modal-root .modal-overlay`, 3D · 사진 뷰어 `.viewer-overlay.open`, 세션 경고 `.session-modal.open`, 재동의 창, 날짜 달력)
  - 가볍게: scroll · resize 는 passive 리스너 → requestAnimationFrame 으로 프레임당 1번 계산. 화면 전환 · 모달 · 토스트는 MutationObserver(class · hidden, 버튼 자신의 변화는 무시)
  - 모든 화면은 창(window) 전체가 스크롤돼요 (안쪽 스크롤 영역 없음) → window 기준. 새 화면에 안쪽 스크롤 영역을 만들면 이 부품도 같이 고쳐요
  - 새로 아래쪽에 고정되는 줄 · 덮는 창을 만들면 `OBSTACLES` · `BLOCKERS` 목록에도 넣어요. 인쇄할 때는 안 보여요(`@media print`)

## 로그인 유지 규칙 (session.js · auth.js)
- **고객 계정**: 예전 그대로 — 로그인 토큰 · 만료 시각(`allabut_session_expires`) = localStorage (같은 브라우저의 모든 탭이 공유, 창을 닫았다 열어도 유지),
  1시간 + [+1h] 연장(남은 시간 최대 3시간) + 5분 전 경고 [1시간 연장] → 만료되면 랜딩 + "Session expired" 3초. 작성 중 주문은 저장
- **직원 계정 = `admin_me()` 로 역할이 있는 계정** (owner · manager · staff · sales — owner 처럼 customer 계정이어도 역할이 있으면 직원 규칙):
  - **브라우저 창을 닫으면 로그아웃**: Supabase 클라이언트의 저장소를 `AUTH_STORAGE`(auth.js)로 바꿔 둠 → sessionStorage 의 `allabut_staff_session` = '1' 이면 sessionStorage, 아니면 localStorage.
    로그인 · 가입은 항상 고객 저장소로 시작(`clearStaffSessionMode`) → `enterApp` 이 역할을 확인하면 `switchToStaffSession()`(session.js) → `useStaffSessionStorage()` 가 토큰을 sessionStorage 로 옮기고 localStorage 것은 지움
    (옮길 키 = `sb.auth.storageKey` + `sb-…-auth-token`). 그 뒤 자동 토큰 갱신도 sessionStorage 에만. 만료 시각도 sessionStorage.
    같은 창 새로고침 · 그 창에서 연 탭 = 유지 / 주소를 새로 친 새 탭 · 창을 닫았다 열기 = 다시 로그인
  - **자리 비움 30분**: 마우스 · 키보드 · 터치 입력(`STAFF_ACTIVITY_EVENTS`)이 있을 때마다 만료 = 지금 + 30분(10초에 한 번만 저장). 5분 전 경고 "자리를 비우셨나요?" + **[계속 사용]**(경고가 떠 있는 동안 지나가는 마우스 움직임으로는 안 닫혀요).
    0이 되면 로그아웃 → **바로 로그인 화면** + "30분 동안 입력이 없어 로그아웃됐어요". 직원에게는 +1h 버튼이 없어요 (헤더 시간은 "입력이 없으면 남은 시간")
  - 로그아웃되면(직원 · 고객 공통 `endSession` → `onSessionEnded`) `#app-main` · `#app-header` · `#app-tabbar` 내용을 지우고, 주소의 # 를 히스토리에서 지워요(`history.replaceState`) → 뒤로 가기로도 앱 화면이 다시 그려지지 않아요(router 는 로그인 전이면 공개 화면만).
    뒤로 가기 캐시(`pageshow` persisted) · 다시 보이는 창(`visibilitychange`)에서도 바로 시간 확인
  - **정지 · 역할 변경 즉시 반영**: `cncRecheckStaffAccess()`(cnc/cnc-team.js)가 `admin_me()` 를 다시 읽어 바뀌었으면 헤더 · 화면을 다시 그림 → 직원 계정이 정지 · 대기면 정지 안내(`PageStaffGate`).
    부르는 때: 1분마다(session.js) · 화면을 옮길 때(router.js, 5초에 한 번까지) · 서버가 `NOT_ADMIN` · `NOT_SALES` 로 거절했을 때(cnc-core.js `cncError`). 네트워크 오류면 아무것도 안 바꿈
  - 로그인 화면 · 직원 초대 가입 화면에 "🔒 공용 컴퓨터에서는 사용 후 꼭 로그아웃하세요" (`public_pc_note`)
- **모든 계정 공통**: 내 정보 "모든 기기에서 로그아웃" 카드(`signOutAllHtml` → `handleSignOutEverywhere` → `endSession('global')` → Supabase `signOut({ scope: 'global' })`) /
  **비밀번호를 바꾸면 다른 기기의 로그인은 모두 끊어요** (`updatePassword` 안에서 `signOut({ scope: 'others' })` — 지금 기기는 유지, 재설정 링크 · 직원 내 정보 둘 다)
- LINE 알림 링크로 들어온 흐름(로그인 전 → 로그인 화면 → 로그인 후 그 페이지, `rememberPendingRoute` 는 sessionStorage)은 직원 · 고객 모두 그대로

## 사용 흐름 규칙
- 로그인(재로그인 포함) 성공 → 항상 `#/home` (예외: 로그인 전에 LINE 알림 링크로 들어왔으면 로그인 후 그 페이지로 — 아래 LINE 링크). 이 계정 첫 로그인이면 한 번 `#/guide` (`localStorage.allabut_guide_seen_{user_id}`). 로그인 상태 새로고침은 지금 페이지 유지
- **직원 계정(account_type 'staff', sql/023)** 은 로그인하면 역할 첫 화면: sales → `#/admin/sales`(**내 실적** — 영업 홈은 따로 없어요) / staff → `#/admin/orders` / manager → `#/admin/dashboard` (owner 는 customer 계정이라 지금처럼 `#/home` + Admin).
  예전 영업 주소 `#/admin/sorders` · `spay` · `scomm` · `srev` 는 내 실적으로 (`PageAdmin.SALES_OLD_TABS`)
  가이드 자동 열기 · 가입 이벤트 · 필수 정보(#/complete) 없음. 고객 주소(`#/home` · `#/new` · `#/orders` · `#/topup` · `#/guide` · `#/complete`)나 권한 없는 관리 탭으로 오면 첫 화면으로 (`CUSTOMER_ONLY_ROUTES`, router.js).
  확인 대기(매니저 초대) · 정지 · 팀에서 빠진 직원은 `PageStaffGate` 안내만 ("대표의 확인을 기다리고 있어요" / "계정이 정지됐어요. 대표에게 문의해 주세요" + [다시 확인] · [로그아웃])
- Sign Out → 앱 확인 모달 (작성 중 주문이 있으면 "저장되어 있어요" 안내). 세션 만료 자동 로그아웃은 확인 없음
- 작성 중 주문(draft)이 있으면 새 주문 맨 위에 "이어서 하기 / 삭제" 카드, 고르기 전엔 입력 잠금. 홈의 안내 바도 같은 동작
- 환자 ID 필수 (앞뒤 공백 제거, 최대 50자). "Anonymous" 기본값 없음
- 가공(milling) 시작 후 취소 불가 — 고객 취소는 submitted 에서만, 관리자 Cancel & refund 는 submitted ~ approved 에서만. DB 트리거 `prevent_late_cancel` → 에러 `CANNOT_CANCEL_AFTER_MILLING`

## 규칙
- **제품 이름에는 항상 CNC 를 붙인다** (9개 언어 모두 "CNC" 는 영문 그대로): 정식 "CNC Custom Abutment" / "CNC Custom Abutment + Zirconia Crown Set", 짧게 "CNC Abutment"(ko "CNC 어버트먼트") / "Crown set"(ko "크라운 세트").
  ko = "CNC 커스텀 어버트먼트", th · vi · tr = 영어 이름 그대로 "CNC Custom Abutment", zh = "CNC定制基台", es · ar · fa = 그 언어 어순("pilar personalizado CNC" · "دعامة CNC مخصصة" · "اباتمنت CNC سفارشی").
  "어버트먼트만" = "CNC 어버트먼트만", 크레딧 종류 = "CNC 어버트먼트 크레딧". 일반 공정 문장("어버트먼트를 가공 중")은 제품 이름이 아니라 그대로.
  범위: lang/ 9개 · 가이드 · 회사소개 · 법적 문서 3종 × 3개 언어 · LINE(`prod_abutment` · `bal_abutment`) · index.html 검색 글 · 세금 문서 품목 이름(sql/026, 앞으로 발행분만)
- **정밀도 표기는 "<5μm" (공차 · tolerance)** — "5μm precision / 5μm 정밀도" 라고 쓰지 않는다. 로고 위첨자 "5μm" · 파비콘 · 공유 이미지 · LINE 아이콘은 브랜드 이름이라 그대로.
  HTML 에 넣을 때는 escHtml(→ `&lt;5μm`), index.html 정적 글은 `&lt;5μm`. 회사소개 `ABOUT_SPEC_TOKENS` 에 '<5μm'(Mono 골드, `dir="ltr"`). ar · fa 문구는 `\u2066<5μm\u2069`(LTR 구간)로 감싸 "<" 가 뒤집히지 않게
- **판매 = allAbut, 제조 = BIOPLANT Co., Ltd. — 인증은 제조사 것으로만 표기** (sql/026):
  - 제조사 값은 **코드에 쓰지 않는다** → `company_settings.manufacturer_name · manufacturer_address · manufacturer_certs(한 줄에 하나: 인증 이름 + 번호) · manufacturer_license_no(태국 FDA 제조 허가) · ad_license_no(광고 허가)`,
    관리자 Settings → Company info → "제조사"(owner, `manufacturerFieldsHtml`). 비어 있는 값은 화면에 안 보여요. 읽기 `cncManufacturerInfo()` · 있는지 `cncHasManufacturerFields()` (cnc/cnc-legal.js)
  - allAbut 이 직접 만들거나 직접 인증을 가진 것처럼 쓰지 않는다 ("We produce …", "in-house metrology", "Certified Quality" + ISO 칩 같은 문장 금지). 회사소개 문구의 제조사 자리는 `{manufacturer}`(비면 "제조 협력사" `about_mfr_partner`, `PageAbout.mt()`)
  - 보이는 곳: 회사소개 "Manufacturer" 섹션(Manufactured by · 주소 · 판매/제조 역할 · **"제조사가 보유한 인증"** 목록 + 태국 FDA 제조 허가 번호) / 모든 푸터 "Sold by {회사명} · Manufactured by {제조사}" (`footer_sold_by`) /
    로그인 전 화면 푸터(랜딩 · 로그인 · 로그인 전 법적 문서 · 회사소개)에만 광고 허가 번호 한 줄 (`footer_ad_license`) / 이용약관 `{manufacturer_name}`(제조사 · 계약 상대방은 allAbut · 인증은 제조사 것) /
    개인정보처리방침 제공 업체 목록에 제조사(스캔 · 주문 자료를 제조를 위해 처리) — **협력 치과기공소(크라운)와 따로** 적어요
  - 랜딩 고정 푸터가 줄이 늘어도 본문을 가리지 않게 `--public-footer-h`(renderFooters 가 재요)
- 사용자가 입력한 값은 HTML 에 넣을 때 **항상 `escHtml()`** (XSS 방지)
- 화면 글자는 전부 번역 키로 (`t()` / `tf()`), 새 키는 9개 언어 파일에 모두 추가
- **숫자 1 일 때 단수 문구**: `tf(key, { n })` 은 n 이 1 이고 **지금 언어에** `key_one` 이 있으면 그 문구를 써요 (영어 "1 tooth" · 스페인어 "1 diente" · 아랍어 "سن واحد").
  단수 · 복수 구별이 없는 언어(ko · th · zh · vi · tr · fa)는 `_one` 을 만들지 않아요 (영어로 넘어가지 않게 지금 언어에서만 찾아요). 지금 `_one` 이 있는 키: `teeth_count_fmt` · `teeth_selected` · `teeth_selected_credits` · `applied_all_fmt` · `sales_recent_order`
- **새 SQL 에러 코드(`raise exception 'CODE'`)를 만들면 화면 코드도 같이**: `cnc/cnc-core.js` 의 `CNC_ERROR_CODES` 에 추가 + `ui/layout.js` `uiErrorMessage` 표에 번역 키 + 9개 언어 문구.
  안 하면 `cncErrorCode` 가 'UNKNOWN' → "문제가 발생했어요" 만 나와요. 메시지 안 코드 찾기는 **긴 코드부터** (`cncErrorCodesLongestFirst` — 'INVALID_MONTHS' / 'INVALID_MONTH', 'SLIP_NOT_FOUND' / 'NOT_FOUND')
- 미리 알 수 있는 실패는 버튼을 막고 이유를 보여 줘요 (예: 세금계산서 판매자 설정이 없으면 [발행] 비활성 + "설정을 마치면 발행할 수 있어요", 그래도 서버가 TAX_SETTINGS_MISSING / RECEIPT_SETTINGS_MISSING 이면 안내 창 + owner 는 [설정으로])
- 크레딧·주문 쓰기는 브라우저에서 테이블에 직접 하지 않고 **DB 함수(RPC)** 로만
  (`create_cnc_order`, `update_my_cnc_order`, `cancel_my_cnc_order`, `customer_cnc_action`)
- 파일은 비공개 버킷 `cnc-files` 의 `{user_id}/{uploadId}/{번호}_{안전한파일명}` 에 올리고,
  `cases[0].stls`(원래 이름) + `cases[0].stlPaths`(경로) 에 저장. 업로드 실패 시 base64 대체 금지
- 보기용 주소는 `createSignedUrl` (1시간). 디자인 파일은 `cnc-designs` 버킷
- 작성 중 주문(draft): `localStorage.allabut_cnc_draft_{user_id}` (파일은 이름만 저장)
- 화면 폭: 모바일 → 1024px 이상 PC(헤더 메뉴, 새 주문 3단) → 1440px 이상 헤더 오른쪽 전체 (그 아래는 ☰ 메뉴)
- 헤더가 한 줄에 안 들어가면 `fitHeader()` 가 단계적으로 줄임 (언어·글자 크기·관리자 메뉴·잔액 자릿수에 따라 자동):
  fit-1 LINE 버튼 "LINE" 만 → fit-2 오른쪽 전체를 ☰ 메뉴로 → fit-3 Top up 을 ☰ 메뉴로 → fit-4 메뉴 간격 좁게 → fit-5 로고 작게 → fit-6 메뉴 글자 조금 작게 + 가이드 아이콘·역할 글자·크레딧 단위 숨김 → fit-7 위쪽 메뉴 대신 아래 탭(회사소개 탭 포함) + 5μm 숨김
  → fit-8 (아주 좁을 때 — 360px · 아랍어/페르시아어 · 글자 130%, 잔액 4자리 등) 헤더 양옆 여백 10px · 간격 좁게, 로고 22px, LINE 버튼은 초록 버튼에 글자 "LINE" 만(로고 아이콘 숨김), ☰ 메뉴 버튼은 글자만("메뉴"), 크레딧 아이콘 작게
  → fit-9 (그래도 넘치면) 크레딧 숫자 · 버튼 글자 조금 작게, 로고 20px. **글자 라벨은 끝까지 남겨요** (아이콘만 있는 버튼 금지). 아래 탭 전환은 계속 fit-7 기준 (`HEADER_TABBAR_LEVEL`).
  헤더에 새 버튼을 넣으면 360px·1024px·1440px 에서 넘치지 않는지 꼭 확인 (9개 언어 × 글자 100/115/130% × 고객 · 관리자 · 영업 · 직원 계정 · 크라운 세트 잔액 두 줄)
- 직원 계정 헤더: 크레딧 · LINE 고객 버튼 · Top up 없음, 로고 옆 역할 배지(`staffRoleBadgeHtml` — 역할 이름 그대로 `badge_role_*`: 영업 / 제작 / 매니저 / 대표), 역할 메뉴가 위쪽 메뉴에 바로 (`STAFF_NAV` · `staffNavItems()`). Admin 메뉴 · 탭 줄은 안 보여요.
  **직원의 ☰ 메뉴는 [내 정보] [언어] [글자 크기] [로그아웃] 만**. 휴대폰 아래 탭에 못 들어간 메뉴(`more` — 매니저의 세금계산서 · 활동 기록 · 광고 배너)는 관리 화면 맨 위 작은 줄 `.staff-more-row` (PC 위쪽 메뉴 줄이 보이면 숨김).
  직원 화면마다 제목 아래 한 줄 안내 `.staff-intro` (`sintro_탭`, 내 정보 `sintro_profile`), 긴 도움말은 역할 첫 화면에만 접힌 채로 (`staffHelpHtml`)
- 좁은 화면 넘침 주의: 안내 상자(`.notice`, `.notice-box`)는 `overflow-wrap: anywhere` — 긴 파일 이름(예: `sql/019_…sql`)이 큰 글씨 · 360px 에서 카드 밖으로 나가 화면 전체가 옆으로 밀리지 않게

## 팀 권한 · 작업 기록 (sql/005_team.sql, 설정 안내: TEAM_SETUP.md)
- 역할: owner ⊃ manager ⊃ staff (`admins.role`) + 별개 역할 **sales(영업)** (sql/015). DB: `admin_role()`, `has_admin_role(p_min)`,
  `is_admin()` = **owner · manager · staff 만 true** (015 부터 — sales 는 false. RLS 의 "관리자 읽기"가 전부 is_admin/has_admin_role 이라 sales 에게 안 열려요)
  - staff: 주문 조회·단계 변경·디자인 업로드·배송 (cnc_orders, cnc-files·cnc-designs), **내 작업**(Activity 탭은 없음)
  - manager: + 충전 승인/거절, 크레딧 지급/차감, 주문 관리자 취소, 고객 목록·프로필·돈 정보, 계정 삭제 요청, Dashboard 주문 통계
  - owner: + 현금 환불, 가격·결제·회사 정보·법적 버전 수정, 매출(admin_finance_*), Team, LINE 그룹
- 005 는 기존 관리자 함수 정의 안의 `is_admin()` 만 `has_admin_role('…')` 로 바꿔 끼워요 → **002·003·004 를 다시 실행하면 005 도 다시**
- 새 관리자 함수를 만들 때는 처음부터 `has_admin_role('필요한 역할')` 로 확인하고, 화면은 `cncHasRole('…')` 로 버튼·탭을 숨긴다.
  **`admins` 표를 직접 조회해서 권한을 판단하지 않는다** (sales 도 admins 에 있어서 열려요 — 015 가 그런 RLS 규칙이 있으면 notice 로 알려줘요)
- **정지 · 확인 대기 (sql/023)**: `admins.active = false`(정지) · `admins.pending_confirm = true`(매니저 초대 → 대표 [확인] 전) 이면 `admin_role` · `has_admin_role` · `is_admin` · `is_sales_rep` 모두 false.
  `admin_me()` 는 역할 + `status`('active' | 'pending' | 'suspended') + `account_type` 을 돌려주고, 화면은 `APP.adminStatus` 가 'active' 일 때만 `cncHasRole` · `isAdmin` · `isSalesRep` 를 켜요
- 화면: `APP.adminRole`, `APP.adminName`, `APP.isAdmin`(관리 팀만), `APP.isSalesRep`(켜진 영업 담당) ← 로그인 때 `admin_me()` → `cncApplyAdminMe()` (005 미실행이면 is_admin → owner 로 봄).
  `PageAdmin.TABS` 의 `min` 으로 탭 제한(`sales: true` 탭은 영업 담당만), 권한 없는 탭 주소는 첫 탭으로 (`defaultTab()`). #/admin 은 `cncCanOpenAdmin()` = 관리 팀 또는 영업 담당

## 영업 · 담당자 · 커미션 — 수금(충전 입금 승인) 기준 (sql/015_sales_commission.sql + sql/016_commission_on_payments.sql)
- **sales 역할**: `_admin_role_rank('sales') = 0` → `has_admin_role('staff' 이상)` false, `is_admin()` false. 화면은 Admin 메뉴 대신 **"영업" 메뉴 하나**(`SALES_NAV_ITEM` → `#/admin/sales`, 탭 줄 없음).
  `is_sales_rep()` = 팀원 + 켜진 `sales_reps` / `my_sales_rep_id()`. owner · manager · staff 도 Team 탭 "영업 담당" 스위치로 켜면 Admin 안에 "영업" 탭이 같이 보여요
- 표: `sales_reps`(user_id pk · active), `sales_rep_rates`(rep_id · type **'percent' | 'per_credit'** · value · effective_from · created_by — 015 의 'per_tooth' 는 016 이 'per_credit' 로 이름만 바꿈),
  `commission_payouts`(rep_id · year · month · total · orders 스냅샷 · paid_at · paid_by · note · **basis** 'payment' | 'order'(015 때 정산, 숫자 그대로 보여줌), 직원·달마다 1줄),
  `refund_cash_lots`(현금 환불을 묶음 → 충전 요청별로 나눈 기록: history_id · lot_id · topup_id · credits · amount_thb, owner 만 읽기).
  읽기 RLS: 영업 담당 = 본인 또는 staff 이상 / 요율 · 정산 = 본인 또는 owner / 충전 요청 표는 sales 에게 안 열려요 (자기 담당 입금은 `sales_my_payments()` 로만). **쓰기는 전부 함수로만**
- **실적 = 수금**: `topup_requests.sales_rep_id` — 트리거 `_trg_topup_sales_rep` 가 **승인(approved)되는 순간** 그 고객의 `profiles.sales_rep_id`(켜진 담당자만, 없으면 null)를 기록.
  직접 수정은 되돌림 (관리자 함수만 `set_config('allabut.rep_ok','1', true)`). 016 이 이미 승인된 예전 충전을 지금 고객 담당자로 한 번 채움(null 인 것만). 충전 승인 함수(`admin_approve_topup`)는 그대로
  - 커미션 달 = 승인 시각(reviewed_at)의 방콕 달 / 요율 = 승인일(방콕)에 유효한 것 (effective_from ≤ 승인일 중 가장 최근, 같은 날이면 나중에 넣은 것, 없으면 0)
  - percent = 입금 subtotal(VAT 제외) × 값% / per_credit = 충전 크레딧 수 × 값 THB (상품 종류 상관없이 크레딧 수, sql/018), 소수 2자리. 무료 크레딧 지급(관리자 · 이벤트)은 topup_requests 가 아니라 실적 아님
  - **현금 환불 차감**: `admin_refund_cash`(004 본문 + owner 권한 + `refund_cash_lots` 기록, 실제 송금액을 묶음 환불 가능액 비율로 나눔) → 그 충전의 담당자에게 **환불한 달**에 마이너스
    (percent → 환불액(VAT 제외 = 환불액 × subtotal/total) × 원래 % / per_credit → 환불된 크레딧 × 원래 THB, 원래 = 그 충전 승인일의 요율).
    추적이 안 되는 환불(016 전 환불 · 충전 기록 없는 묶음)은 마이너스 없이 커미션 탭에 **"확인 필요"** (`_commission_unresolved_refunds`)
- 담당 지정 (manager 이상): `admin_set_customer_rep(p_user, p_rep, p_apply_open_orders)` = **앞으로의 입금에만** (세 번째 인자는 호환용, 무시) /
  `admin_set_topup_rep(p_topup, p_rep, p_reason)` = 승인된 입금 한 건 (아니면 `NOT_EDITABLE`, 이미 담당이 있으면 사유 필수, 지급 완료한 달(승인한 달 · 그 충전의 환불이 있는 달)이면 `COMMISSION_LOCKED`) → 작업 기록 'topup_rep' · 'customer_rep'
- **주문 기준은 016 에서 없앴어요**: `cnc_orders.sales_rep_id` · `shipped_at` · 주문 트리거 · `admin_set_order_rep` · `sales_my_orders` · 배송일 기준 계산. `create_cnc_order` 는 015·016 모두 안 바꿈 (012 정의 그대로).
  015 때 주문에 남은 review_history 'rep_changed' 는 고객 화면에서 숨기고(`ADMIN_ONLY_HISTORY_ACTIONS`) 관리자 타임라인에만 이름으로. 작업 기록 'order_rep' 도 예전 기록으로 보여줌
- 함수: `admin_commission_month(y, m)`(owner: 직원별 입금 건수 · 입금액(VAT 제외) · 충전 크레딧 · 환불 건수 · 환불 차감 · 커미션 + 건별 상세(입금 'payment' · 환불 'refund'), `unassigned` = 담당 미지정 승인 입금 수, `unresolved_refunds`) /
  `my_commission_month(y, m)`(영업 본인) / `sales_my_payments()`(영업 본인: 요청번호 · 고객(치과명) · 승인일 · 크레딧 · 금액 — 슬립 · 환자 · 주문 없음)
  - 정산 `admin_mark_commission_paid(rep, y, m, note)`(owner, 달이 끝나야 `MONTH_NOT_ENDED`, `ALREADY_PAID`) → 입금 기준 건별 스냅샷 저장(basis 'payment') = 잠금 /
    `admin_unmark_commission_paid(rep, y, m, reason)`(owner, 사유 필수 → 잠금 풀림, 지금 데이터로 다시 계산)
- 요율: `admin_set_rep_rate(rep, type, value, effective_from)`(owner, 'percent' 0~100 · 'per_credit' 0~1,000,000 THB, 예전 'per_tooth' 로 불러도 per_credit, 이력은 지우지 않음), 목록 `admin_list_sales_reps()`(staff 이상 이름 · 켜짐 / 요율은 owner 에게만)
- 화면 (`ui/page-admin-sales.js` + `cnc/cnc-sales.js`):
  - Team 탭(owner): 역할에 "영업" (015 실행 뒤에만), 팀원마다 "영업 담당" 스위치(sales 역할은 항상 켜짐) + "커미션 설정" 창(**입금액의 % / 충전 크레딧 1개당 THB** · 값 · 적용 시작일 `uiDateField` 기본 오늘 · "입금 승인일 기준으로 적용돼요" → 요율 이력 표: 적용 중 · 예정 · 지난)
  - Top-ups 탭: 승인된 입금마다 "담당" 칸 + "담당 영업" 필터(전체 · 담당 없음 · 사람별, 016 전이면 숨김) / 상세 "담당 영업" + 변경(manager 이상). 승인하면 그 줄을 다시 읽어 담당을 바로 보여줘요
  - Customers 상세: "담당 영업" 선택 (앞으로의 입금에 적용). 저장한 뒤 그 고객의 **"승인됨 + 담당 없음"** 입금이 있으면 (owner 는 그 담당자의 정산 잠긴 달을 빼고 셈)
    "이미 승인된 입금 n건에도 지정할까요?" → 예 = 한 건씩 `admin_set_topup_rep`(사유 `rep_backfill_reason` "고객 담당 지정과 함께"), 잠긴 달은 건너뜀 / 아니요 = 앞으로만. 담당이 있는 입금은 안 건드림
  - 커미션 탭 `#/admin/commission`(owner) · 영업 탭 `#/admin/sales`(영업 담당): **들어올 때마다(탭 클릭 · 주소) 항상 이번 달(방콕)** — `resetMonthTab()` 이 보던 달을 지워요.
    ◀ 월 ▶ 가운데에 이번 달이 아니면 [이번 달] 바로가기
  - 커미션 탭: 직원별 카드(제목 옆 상태 배지 "미지급"(회색) / "지급 완료 · 날짜"(초록), 입금 건수 · 입금액 · 환불 차감(빨강) · 커미션) ·
    펼치면 건별 상세(승인일 · 고객 · 요청번호 · 패키지 · 금액 · **계산 근거** "57,000.00 THB × 5%" / "30 크레딧 × 100.00 THB" / 환불 "− 환불 …" /
    요율 없음 → "요율 없음 (요율 시작일 … 이전 승인)" 또는 "(요율이 설정되지 않았어요)" — 첫 요율 시작일은 `cncRepFirstRateDates()`, 커미션) ·
    **[지급 완료로 표시하기]** 는 달이 끝났고 미지급일 때만 (달이 안 끝났으면 버튼 대신 "11월이 끝난 뒤(12월 1일부터) 지급 완료로 표시할 수 있어요") / 지급됐으면 [지급 취소](사유) ·
    CSV(`allabut-commission-YYYY-MM.csv`, 기존 CSV 규칙, 종류 payment/refund) · "담당 미지정 입금 n건 → 지정하기"(Top-ups 탭: 승인됨 + 담당 없음 + 그 달 승인 칩) · "확인 필요" 환불 목록.
    **담당 입금이 없는 달**은 카드 대신 "이 달에 승인된 담당 입금이 없어요" + 담당 미지정 입금 수(+ 지정하기) + [지난달] [이번 달]
  - 영업 탭: sql/024 부터 아래 "직원 계정" 의 **내 실적** 한 화면 (예전 "내 월별 커미션 + 입금 내역" 화면 `salesHtml` 은 sql/023 실행 전에만)
  - 커미션 · 영업 화면에는 예전 주문 기준 문구(주문 · 치아 · 배송일 · 유료 치아)를 쓰지 않아요. 015 때 정산(basis 'order')은 "예전 방식"으로만 표시
  - 015 실행 전이면 담당 칸 · 필터 · 영업 역할이 안 보이고, 커미션 탭은 "DB 업데이트(sql/015 · sql/016)" 안내만
- 팀 함수(owner): `admin_list_team`, `admin_add_member(email, role, name)`(가입한 이메일만, USER_NOT_FOUND), `admin_set_role`, `admin_set_member_name`, `admin_remove_member` (자기 자신·마지막 owner 불가: CANNOT_REMOVE_SELF / LAST_OWNER)
- 작업 기록 `admin_audit_log`: 쓰기는 트리거·함수만 (팀원이 한 일만 기록: 주문 단계·배송·디자인·관리자 취소, 충전 승인/거절, 크레딧 지급/차감, 현금 환불, 팀 변경, 설정 변경).
  **읽기는 역할별 (sql/024, RLS "audit: read by role" = `can_read_audit(action, target_type)` → `_audit_min_role`)**:
  staff = 주문 작업만 (order_stage · order_design · order_shipping · order_deadline) / manager = + 충전 승인·거절 · 크레딧 지급·차감 · 주문 관리자 취소 · 세금계산서 발행·우편 · 광고 배너 · 고객 일(settings_changed 중 target_type 'clinic_change' · 'customer') /
  owner = 전부 (영업 · 커미션 · 담당 지정 · 팀 · 직원 · 설정 · 서비스 상태 · 파일 보관 · 현금 환불 · LINE 그룹) / sales = 못 봄. **목록에 없는 새 기록 종류는 자동으로 owner 만** — 새 action 을 만들면 누가 봐야 하는지 `_audit_min_role` 에 넣는다(새 SQL 파일에서 다시 정의)
  - 화면: Activity 탭(누가 · 무엇을 · 주문번호 필터)은 **owner · manager 만** (`TABS` min 'manager'), "무엇을" 묶음도 역할별 (`cncAuditGroupsForRole`: manager = 주문 · 충전 · 크레딧 · 설정)
  - 제작 직원 **"내 작업"** 탭 (`#/admin/mywork`, `onlyRole: 'staff'`): 필터 없이 내가 처리한 주문 작업만 (actor_id = 나), 오늘 / 이번 주(월요일부터) / 이번 달 / 그 전 묶음(방콕 날짜), 줄마다 주문번호(누르면 그 주문 상세) · 한 일 · 시각
- `review_history` 의 관리자 기록은 `by: 'admin'` 그대로 + DB 트리거가 `by_name`·`by_id`(실제 처리자)를 붙임. 관리자 화면 타임라인만 이름 표시 (`uiHistoryList(history, true)`), 고객 화면은 "관리자"

## 직원 계정 · 초대 링크 · 역할별 화면 (sql/023_staff_accounts.sql)
- **계정 종류** `profiles.account_type`: 'customer'(기본, 기존 계정 전부 · owner 도) | 'staff'. 고객이 직접 못 바꿔요 (트리거 `_trg_profile_account` 가 되돌림, 서버 함수만 `allabut.staff_ok`)
  - 직원 계정 = 본명 · 전화 · 이메일 · 비밀번호만. 필수 정보 입력(`cncNeedsProfileInfo`) · PROFILE_INCOMPLETE · 등록 정보 잠금에서 빠져요. 전화 중복 검사는 고객 · 직원 통틀어 그대로
  - 크레딧 · 무료 크레딧 이벤트 · 세금계산서 · 고객 목록 · 고객 수 · 가입 전환 · 의심 배지 · 담당 영업 지정(`NOT_CUSTOMER`) 대상에서 빠짐. 고객 목록은 `cncAdminListUsers` 가 화면에서 걸러요 (`admin_list_users` 는 repo 밖)
  - 주문 · 충전 불가: `create_cnc_order` · `create_topup_request` 맨 앞 + 표 트리거 → `STAFF_ACCOUNT`. 약관 · 개인정보 동의는 고객과 같이
- **초대 링크** `staff_invites`(token_hash sha256 · role 'sales' | 'staff' | 'manager' · note · expires_at(1~168시간, 기본 48) · created_by · used_by · used_at · revoked_at). RLS 켜짐 + 정책 없음 = 함수로만
  - owner: `admin_create_staff_invite(role, hours, note)` → 토큰 원문은 이때 한 번만 (96자 16진수, gen_random_uuid 3개 = 랜덤 366비트 ≈ 45바이트 (32바이트 이상)) / `admin_list_staff_invites()`(상태 waiting · used(누가) · expired · revoked) / `admin_revoke_staff_invite(id)`
  - 링크 `{SITE_URL}/#/join?t=토큰` (`cncInviteLink`). 로그인 없이: `check_staff_invite(token)` → `{ valid, role }` 만 (64자 미만은 바로 invalid)
  - 가입: `#/join` 칸 = 본명 · 전화(uiPhoneField) · 이메일 · 비밀번호 · 비밀번호 확인 · 약관 동의 · Turnstile → `signUp` 메타데이터 `staff_invite`. 프로필이 만들어질 때 트리거가 초대 줄을 잠그고(for update — 같은 링크 동시 가입은 하나만) 검사 →
    account_type 'staff' + admins 역할(매니저는 pending_confirm) + 영업이면 sales_reps + 초대 사용 처리 + 작업 기록 'staff_joined'. **역할은 초대 기록에서만** (브라우저 값 안 믿음)
  - 만료는 **auth.users.created_at(가입 시각) 기준** — 이메일 인증을 나중에 해도 가입할 때 유효했으면 통과. 틀림 · 만료 · 사용됨 · 취소 → `INVITE_INVALID` (프로필 안 만듦 = 고객 계정이 생기지 않음) → 화면 "이 초대 링크는 더 이상 쓸 수 없어요. 대표에게 새 링크를 요청해 주세요"
  - 일반 회원가입 화면에는 직원 선택지가 없어요
- **역할별 메뉴** (`STAFF_NAV`, ui/layout.js — sql/024 때 단순하게): 영업 = **[내 실적] [내 거래처] [내 정보]** / 제작 직원 = **[주문] [내 작업] [내 정보]** / 매니저 = 주문 · 충전 · 고객 · 대시보드 · 세금계산서 · 활동 기록 · 광고 배너(설정 탭) · 내 정보 / owner = 지금처럼 전부 + 직원.
  각 역할 첫 화면 위에 접는 도움말 "이 화면에서 할 수 있는 일" (`staff_help_sales` · `staff_help_staff` · `staff_help_manager`). 내 정보(직원) = 이름 · 이메일(읽기 전용) · 전화 · 언어 · 비밀번호 변경만
- **"내 실적" 한 화면** (`#/admin/sales`, ui/page-sales.js, 들어올 때마다 이번 달 · 맨 위 ◀ 월 ▶ 하나로 전체가 같이 바뀜):
  1) 큰 카드 "이번 달 받을 커미션"(지난달이면 "11월 커미션") 크게 + 작은 글씨 입금 합계(VAT 제외) · 건수 · 환불 차감 · 지급 상태(미지급 / 지급 완료 날짜) ← `my_commission_month`
  2) "내 고객 결제": 그 달 승인 입금(+ 그 달 환불 차감 줄) — 날짜 · 치과명 · 상품 · 크레딧 · 금액(VAT 제외) · 내 커미션(**계산 근거는 금액을 눌렀을 때만** `details.perf-basis`) + 합계 줄
  3) "내 고객 주문": 그 달 접수 주문 — 접수일 · 치과명 · 주문번호 · 치아 수 · 지금 단계 · 납품일 + 합계 줄 ← `sales_my_client_orders(그 달 1일, 말일)`
  4) 맨 아래 접이식 "지난 12개월 보기"(들어올 때마다 접힘, 열 때 `sales_my_revenue(12)` — 막대 · 달별 표, 누르면 그 달로)
  표가 비면 "이 달에는 아직 없어요" 한 줄. 필터 · 검색 · 맨 위 그래프 없음. **휴대폰(720px 이하)은 표가 카드 목록** (`.rtable` + 칸마다 `data-label`, 가로 스크롤 없음). 금액은 `thbHtml`(숫자만 .mono, "THB" 와 한 덩어리 `.thb`)
  "내 거래처" = 치과명 · 담당자 · 전화 · 최근 주문일 · 최근 입금일 + 검색 한 칸 (정렬 · 지역 · 잔액 칸은 없앰)
- **영업 서버 함수** (전부 `my_sales_rep_id()` 의 담당 거래처만, 정지 · 대기면 `NOT_SALES`): `sales_my_summary()`(지금 화면에서는 안 씀)(이번 달 입금 · 커미션 · 거래처 수 · 진행 중 주문 · 대기 충전 · 최근 활동) /
  `sales_my_clients()`(치과명 · 담당자 · 전화 · 지역(주소 앞 24자) · 가입일 · 최근 주문일 · 최근 입금일 · 이번 달 입금액 · 진행 중 주문 · 잔액 숫자만, 화면에서 검색 · 정렬) /
  `sales_my_client_orders(from, to, stage 'active' | 'done')`(주문번호 · 치과명 · 접수일 · 단계 · 납품일 · 치아 수 + 타임라인(종류 · 날짜만) — **환자 · 메모 · 파일 · 디자인 · 주소 없음**, 읽기 전용) /
  `sales_my_pending_topups()`(금액 · 날짜) / `sales_my_revenue(months 1~24)`(달별 입금 · 건수 · 환불 · 커미션 — 막대 그래프, 달을 누르면 `my_commission_month` 건별로 거래처 표) / `sales_my_payments` 에 client_id (거래처 · 기간 필터).
  영업에게 cnc_orders · profiles(본인 제외) · topup_requests 표 직접 읽기는 안 열려요. 영업 계정은 주문 · 충전 불가. 입금 실적은 "그 입금을 받은 담당자" 기준, 거래처 목록은 "지금 담당" 기준
- **대표 "직원" 메뉴** (`#/admin/team`, 탭 이름 "직원", owner): `admin_list_staff()`(이름 · 이메일 · 전화 · 역할 · 상태 · 계정 종류 · 가입 · 마지막 로그인 · 초대 가입 여부 · 거래처 수 · 요율) ·
  [초대 링크 만들기](역할 · 유효 시간 · 메모 → 링크 + [복사] + "한 번만 · n시간 뒤 만료", 창을 닫으면 다시 못 봄) · 초대 목록 + [취소] ·
  직원마다 역할 변경 · 매니저 [확인](`admin_confirm_member`) · [거래처 n](`admin_rep_clients` → 여러 곳 골라 `admin_move_clients(users[], to)`) · 커미션 설정(기존) ·
  [정지](`admin_set_member_active(user, false, move_to)` — 영업 거래처는 담당 없음 또는 다른 영업에게) / [다시 켜기] · 이름 변경 · [직원 계정으로 전환](`admin_convert_to_staff`, 크레딧 잔액 `HAS_CREDITS` · 진행 중 주문/대기 충전 `HAS_ACTIVE_ORDERS` 이면 막힘, 자동 전환 없음).
  자기 자신 · 마지막 owner 는 정지 · 역할 변경 불가 (`CANNOT_CHANGE_SELF` · `LAST_OWNER`). 맨 아래 작게 "기존 계정을 직원으로 전환"(예전 `admin_add_member`)
- 대시보드 "지금 처리할 일"(owner): `admin_staff_todo()` → 매니저 확인 대기 카드 + "새 직원 가입: 이름(역할)" (최근 7일) → 직원 탭
- 작업 기록: staff_joined · staff_invite_created · staff_invite_revoked · staff_confirmed · staff_suspended · staff_reactivated · clients_moved · staff_converted (Activity "팀" 묶음)
- `launch_reset.sql` 의 계정 삭제는 직원 계정 · 초대 기록을 지우지 않아요

## 관리자 화면
- 로그인할 때 `admin_me()` → `APP.adminRole` / `APP.isAdmin`. 팀원만 헤더·하단 탭에 골드 "Admin · 역할" 메뉴
- 관리자가 아닌 사람이 `#/admin` 으로 오면 `#/home` 으로 (화면에서 숨기는 것은 편의, 실제 보호는 DB 규칙)
- 단계 처리는 `cnc_orders` 직접 update (관리자 update 정책) + `updated_at`,
  `review_history` 에 `{ action, note, date, by: 'admin' }` 추가.
  update 할 때 "지금 단계"도 조건으로 걸어서, 그 사이 바뀌었으면 `STAGE_CHANGED` 에러
- 디자인 파일: `cnc-designs/{고객 user_id}/{주문번호}/v{버전}_...` →
  `design_versions` 에 `{ version, paths: [...], names: [...], date }` → stage = `design_ready`
- 취소·환불은 가공 전 단계만 (`submitted ~ approved`), `admin_cancel_cnc_order` RPC
- 크레딧 충전/차감: `admin_add_credits(p_user, p_amount, p_description, p_product)` (종류 기본 abutment, sql/018)
- 주의: DB 읽기 규칙이 "자기 것 또는 관리자"라서, 고객용 조회(내 주문·크레딧 이력)는 항상 `user_id = 내 id` 로 거른다

## LINE 알림 (Supabase Edge Function — 배포 방법은 `LINE_SETUP.md`)
- `supabase/functions/line-webhook/index.ts` — LINE → 서버. x-line-signature 검증, 친구추가 안내, 연결 코드(AB-XXXX) → `profiles.line_user_id` 저장 (1:1 채팅만).
  그룹: join → GRP- 코드 안내 / 그룹의 GRP-XXXX(30분, 1회) → `admin_notify_targets` 저장 / leave → active=false / 그룹의 다른 메시지는 무시
- `supabase/functions/line-notify/index.ts` — DB Webhook → LINE. 헤더 `x-notify-secret` 확인, 관리자(영어)·고객(9개 언어) Flex 카드
  - 관리자 알림 받는 곳: `admin_notify_targets` 중 active + 카테고리(orders / topups / account). 대상이 하나도 없을 때만 `LINE_ADMIN_USER_ID` (안전장치)
  - 직원이 처리한 일(by_name 있는 새 기록, 충전 승인/거절의 reviewed_by)은 연결된 그룹에만 "Confirmed by Ken" 카드
  - **고객 알림 사본** (카테고리 `customer_copy`, sql/006_customer_copy.sql): 고객에게 가는 알림(confirmed·design_ready·milling·shipped·관리자 취소,
    credit_history charge·use·refund·adjust·expire, EXPIRY_REMINDER, 충전 거절)은 고객 LINE 연결 여부와 상관없이 `sendCustomerCopy()` 로
    사본 카드를 관리자에게도 보냄 (고객명 + 이메일, 내용, 처리자, LINE 연결 여부 + 미연결이면 전화번호).
    관리자 알림이 이미 가는 일(새 주문·고객 승인·수정 요청·수령·고객 취소·충전 요청)은 사본 없음.
    사본에 처리자가 들어가는 일은, 사본을 받는 그룹에 "… by 이름" 카드를 따로 안 보냄 (중복 방지). 대상이 하나도 없으면 LINE_ADMIN_USER_ID
  - **카드 모양 v2 — 심플 · 전문적, 모든 알림이 `buildReceiptCard()` 하나** (관리자·사본·고객 9개 언어 공통, 흰 바탕, bubble `mega`):
    - header = 높이 4px 색 띠 하나 (그 알림의 제목 색, `paddingAll 0px`)
    - body `paddingAll xl`: ① 윗줄 [로고 `SITE_URL/assets/brand/line-icon.png` 28px] [“allAbut” sm bold #001D4A] … [사본이면 오른쪽 "COPY" 배지(#F3F4F6 · 글씨 xxs bold #4B5563)]
      ② 제목 `xl` bold 알림 색, 왼쪽 정렬 ③ 한 줄 [문서번호 xs bold #374151] … [날짜 xs #6B7280, 방콕 "13 NOV 2026 · 11:11 AM"] (문서번호가 길면 줄바꿈)
      ④ 안내 문장(있을 때만) sm #374151 ⑤ 구분선 #E5E7EB (`xl`) ⑥ 섹션들 — **섹션 사이 구분선 없이 여백(`xxl`)만** ⑦ 구분선(`xxl`) → 합계
    - 섹션: 제목 `md` bold #111827 / 첫 내용 `md`. Clinic = 이름 sm bold + 회색 sm **최대 2줄**(첫 줄 = 주소, 둘째 줄 = 나머지 "전화 · 이메일"을 " · " 로 합침),
      LINE 미연결 = "● " + 빨간 sm regular (상자 없이), "Sent to customer LINE" = 회색 sm.
      항목 줄 = 라벨 sm regular #6B7280 flex 4 · 값 sm regular #111827 오른쪽 flex 6 wrap, 줄 사이 `md`, **들여쓰기 없음**. 치아 줄 = 번호 sm bold · 브랜드 sm 회색 · 쉐이드 sm 오른쪽.
      날짜 값(납기 · 유효기간 · 확정 납품일 등 'YYYY-MM-DD')은 "20 Nov 2026" (`niceDate()`)
    - 합계: 작은 줄(항목 줄과 같음) → 큰 줄 [라벨 md bold] [값 `xxl` bold 오른쪽 flex 0 — 금액이 안 꺾이게] → "Paid n · Free n" xs 회색 오른쪽. 회색 상자 · 빨강 상자는 안 써요
    - footer `paddingAll xl` · `paddingTop 0px`: 네이비(#001D4A) 버튼(모서리 8px, 흰 글씨 sm bold) + 안내 두 줄 xxs #9CA3AF 가운데 (자동 알림 문구 `R.auto_note` / 회사명 · Tax ID · 사이트)
    - "allAbut · Order notice" 같은 부제목 줄과 "COPY OF CUSTOMER NOTICE" 줄은 없어요 (ReceiptOpts 의 `subtitle` 은 호환용으로만 남음, `copyLabel` 이 있으면 COPY 배지)
    - 빈 줄 · 빈 섹션은 빼요 (Flex 는 빈 text 를 못 받아서). 휴대폰 폭(약 300px)에서 긴 치과명 · 주소 · 태국어는 줄바꿈 (`docs/flex-samples/` 로 확인)
  - 만드는 함수: `orderReceipt()`(cnc_orders 의 cases·clinic·addr·phone·patient·deadline·credits_used + credit_wallets 잔액), `topupReceipt()`(topup_requests 의 credits·unit_price·subtotal·vat_amount·total), `creditReceipt()`
  - 제목 색(= 맨 위 4px 띠 색): 관리자 = `ADMIN_NOTICE_STYLES` 의 종류별 색·제목(title) / 고객 = 네이비, 취소·충전 거절만 빨강. 글씨 #111827 · 회색 #6B7280 · 구분선 #E5E7EB
  - 테스트 서비스(sql/017 'test'): 윗줄 오른쪽 회색 "TEST" 배지 (COPY 와 같은 모양, 둘 다면 TEST → COPY). 샘플 `12-test-mode-copy-admin`
  - 사본: 윗줄 오른쪽 "COPY" 배지, Clinic 섹션 둘째 줄에 고객 이메일, LINE 미연결이면 그 아래 "● " 빨간 글씨 + 전화번호, 처리자는 상세의 "Handled by"
  - altText = "제목 · 문서번호" (사본은 앞에 "COPY · "). 고객 문구는 9개 언어(`T` + 영수증 문구 `R`), 관리자·사본은 영어
  - Flex 의 text 는 빈 글자를 못 받아서 값이 빈 줄은 빼요. 샘플: `docs/flex-samples/` (사이트에 안 올라감)
  - 관리자 주문 카드: `bonus_used > 0` 이면 Shipping 섹션에 "🎁 Free credits used · ship to registered clinic address only" (`freeShipSection`)
  - 무료 크레딧 지급: "🎁 Free credits" 카드 (`notifyFreeCredits`, 판단은 credit_lots.source — `isFreeCharge`)
  - **LINE 메시지의 사이트 링크는 전부 `siteLink(path)`** (line-notify·line-webhook 각각): `{SITE_URL}/?openExternalBrowser=1#{path}` → 휴대폰 기본 브라우저로 열림.
    쿼리는 반드시 `#` 앞. 주문 카드는 그 주문으로 바로: 고객 `orderLink(id)` = `#/orders?id=…`, 관리자 `adminOrderLink(id)` = `#/admin/orders?order=…`. LINE 친구추가 주소(line.me)는 그대로
  - 사이트(ui/router.js): `cleanExternalQuery()` 가 주소창에서 `openExternalBrowser` 만 지움(해시·다른 쿼리 유지), `applyDeepLink()` → `#/orders?id=` 는 `PageOrders.openId`(진행 중 → 완료 → 주문번호 검색 순으로 찾아 펼침),
    `#/admin/orders?order=`·`#/admin?order=` 는 `PageAdmin.pendingOrder` → 주문 상세 창. 로그인 전에 LINE 링크로 오면 로그인 화면 → 로그인 후 그 페이지(`rememberPendingRoute`/`takePendingRoute`, sessionStorage). LINE 링크가 아니면 예전처럼 랜딩
  - 관리자 화면 범례: Settings → LINE groups 의 "알림 색 안내" (`ADMIN_NOTICE_LEGEND`, cnc/cnc-team.js) — **색을 바꾸면 두 곳 다**
- 관리자 Customers 탭: LINE 연결 표시(✅/❌, profiles.line_user_id) + "LINE 미연결 고객만" 필터
- **비밀값은 코드·저장소에 절대 쓰지 않는다.** Edge Function 안에서 `Deno.env.get()` 으로만 (Secrets: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, LINE_ADMIN_USER_ID, NOTIFY_SECRET — `data-retention` 도 같은 NOTIFY_SECRET 을 써요, DB 쪽은 Vault `notify_secret`).
  SUPABASE_SERVICE_ROLE_KEY 는 Edge Function 에서만, 브라우저 코드에는 절대 넣지 않는다
- `profiles.line_user_id` 는 **LINE 알림 연결 전용** (U + 16진수 32자리). 웹앱은 이 칸을 직접 쓰지 않는다 (연결은 line-webhook, 해제는 `unlink_my_line()`).
  주문의 "LINE ID" 칸(`cnc_orders.line_id`)은 연락용 글자일 뿐, 프로필에 저장하지 않는다
- 관리자 취소는 먼저 review_history 에 `{ action: 'admin_cancelled', by: 'admin' }` 을 붙인 뒤 `admin_cancel_cnc_order` → line-notify 가 고객 취소와 구분
- 고객 화면의 LINE 연결은 전부 공통 부품 `ui/line-connect.js` (`LineConnect`) 하나로:
  - 연결 상태는 `LineConnect.isLinked()` (APP.profile 기준) 한 곳. 바뀌면 `LineConnect.refreshAll()` → 헤더·안내 띠·Profile 섹션·완료 카드 같이 갱신 + `linechange` 이벤트
  - 헤더: 미연결 = 초록(#06C755) "LINE 연결" 버튼 → 연결 모달 / 연결됨 = 작은 초록 체크(툴팁 "LINE 연결됨") → Profile 의 LINE 섹션
  - 안내 띠 `lineBannerHtml()`: Home·New Order·My Orders·Top up·Guide 맨 위 (작성 중 주문 카드가 있으면 그 아래). Hide → 7일 숨김 (`localStorage.allabut_line_banner_hidden_{user_id}`)
  - 모달 `LineConnect.openModal()`: 연결 코드, 모바일은 Add friend 버튼이 가장 크게 / PC 는 QR 이 가장 크게. 열려 있는 동안 5초마다 연결 확인(최대 10분) → "✅ LINE 연결 완료!" 3초 후 닫힘. 닫으면 확인 중지
  - Profile: `LineConnect.mountSection(box)` (3단계 안내, Add friend, PC QR, 코드 + Copy, 상태 확인, Disconnect)
  - 주문 완료·충전 요청 완료 화면: 미연결이면 `lineCtaHtml()` 카드
  - QR 라이브러리 `loadQrLib()` 도 이 파일에 (LINE QR·PromptPay QR 공용)

## Supabase
- 테이블: `profiles`(+ clinic_name, address, phone, tax_id, line_user_id, lang), `admins`(+ role, display_name, added_by), `credit_wallets`,
  `credit_history`, `cnc_orders`, `invoices` — SQL 은 `CNC_PORT_PLAN.md` 6장
- `guilds` 테이블, `profiles.avatar` 컬럼은 DB 에 남아 있지만 코드에서는 쓰지 않는다
