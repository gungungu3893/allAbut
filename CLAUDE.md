# CLAUDE.md

## 브랜치
- 브랜치명: `main`

## Git Rules
- 작업 후 항상 아래 명령을 실행한다:
  ```bash
  git add . && git commit -m "메시지" && git push origin main
  ```

## 배포 · 도메인
- 사이트 주소: **https://allabut.com** (www.allabut.com 도 연결 — www → allabut.com 301 은 Cloudflare 대시보드 Redirect Rules 에서)
- 호스팅: **Cloudflare Pages** (프로젝트 `allabut`), `main` 브랜치에 push 하면 자동 배포
  - Build command: `bash build.sh` / Build output directory: `dist`
  - `build.sh` 가 공개 파일만 `dist/` 에 복사 → `*.md`, `sql/`, `supabase/` 는 배포되지 않아 404
  - **사이트에 새 파일·폴더를 추가하면 `build.sh` 목록에도 추가** (안 하면 사이트에서 404)
  - `404.html` 은 지우지 않는다 (없으면 Cloudflare 가 없는 주소에 index.html 을 200 으로 보여줌)
  - `_redirects` (빌드 설정을 깜빡했을 때 문서 주소 → 404 페이지 안전장치), `_headers` (기본 보안 헤더)
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
- 랜딩·로그인: 다크 `#06090f` + 골드 로고 (B1 스타일), 로그인은 흰색 카드
- 로그인 후 앱: 밝은 테마
  - 배경 `#F7F8FA`, 카드 흰색, 글자 네이비 `#001D4A`, 포인트 골드 `#D4AF37`
  - 보조 회색 `#6B7280`, 테두리 `#E5E7EB`
- 밝은 배경 로고: all/but 네이비, A 골드, 5μm 골드
- 색은 `css/landing.css` 의 `:root` 변수 한 곳에서 정의

## 폰트
- IBM Plex Sans (본문), IBM Plex Mono (숫자·주문번호·라벨) — Google Fonts CDN
- 태국어·아랍어·페르시아어는 IBM Plex Sans Thai / Arabic 로 보완

## 확정 사항
- 치아 32개 (FDI, 사랑니 포함)
- 브랜드·쉐이드·사이즈는 **치아마다 따로** (브랜드·쉐이드 필수, 사이즈 선택)
- 한 주문 = 환자 1명 (`cases` 배열에 1개)
- 파일: STL / PLY / OBJ / 3MF / JPG / PNG / PDF, 파일당 50MB, 최대 10개
- 1 치아 = 1 크레딧 (차감은 DB 함수 `create_cnc_order` 가 한 번에 처리)
- 9개 언어: en ko th zh vi es tr ar fa (ar / fa 는 RTL)

## 크레딧 · 충전 정책 (확정)
- 가격 (VAT 7% 별도, 개당 THB): 1개 2,200 / 10개 2,050 / 30개 1,900 / 50개 1,750 / 100개 1,500
  → `credit_packages` 테이블, 관리자 Settings 에서 수정. 금액 계산은 항상 DB 함수(`create_topup_request`)가 함
- 결제: PromptPay QR(EMVCo 페이로드를 `cnc/promptpay.js` 가 직접 생성) + 계좌이체 → 입금 슬립(`topup-slips/{user_id}/...`, 10MB, 이미지·PDF) → 관리자 승인
- 크레딧 묶음(`credit_lots`): 충전(승인)일로부터 12개월 유효, 사용은 먼저 만료되는 묶음부터 (FIFO, `credit_lot_usage` 에 주문별 기록)
- 만료 30일·7일 전 LINE 알림, 만료되면 자동 소멸 + 이력 'expire' (pg_cron, 방콕 새벽 1시)
- 주문 취소 크레딧은 원래 묶음으로 복구 (원래 유효기간 유지, 이미 만료된 묶음 몫은 복구 안 함 + 이력)
- 관리자 지급(+) = 보너스 묶음 (12개월, 단가 0 = 현금 환불 불가), 차감(-) = FIFO
- 현금 환불: 충전 14일 이내 + 미사용 = 전액 / 일부 사용 = 사용분을 1개 가격(2,200 + VAT)으로 재계산 후 잔액 / 만료·보너스·이전 잔액 불가.
  관리자 화면에는 계산기(`admin_refund_quote`)와 기록(`admin_refund_cash`)만, 송금은 수동
- `credit_wallets.balance` = 만료 안 된 묶음 remaining 합계 (DB 함수가 항상 맞춤). 화면은 계속 balance 를 읽음
- SQL: `sql/002_credit_topups.sql`, 설정 안내: `TOPUP_SETUP.md`
- 금액 표시는 `formatTHB()` (언어와 상관없이 21,935.00 THB)

## 법적 문서 · 동의 (sql/003_legal.sql, 설정 안내: LEGAL_SETUP.md)
- 운영 국가 태국, 태국 PDPA. 치과 = 환자 개인정보 Controller, allAbut = Processor. 환자 데이터(스캔·사진·환자 ID)는 민감정보 — 실명 대신 차트번호 등 가명 ID
- 문서: `#/terms`, `#/privacy`, `#/credit-policy` — **로그인 없이도** 볼 수 있음 (로그인 전: `screen-legal` 화면)
- 본문: `legal/{terms|privacy|credit}.{en|th|ko}.js` (`LEGAL_DOCS['terms.en']`). 영어가 기준, th·ko 번역. 다른 6개 언어는 영어 본문 + 안내.
  본문 배열에서 문자열 = 문단, 배열 = 목록, '{{PRICE_TABLE}}' / '{{REFUND_EXAMPLE}}' = 가격표·환불 예시 (credit_packages 에서 자동)
- 회사 정보는 하드코딩 금지 → `company_settings` 에서 읽어 `{company_name}` 등 자리에 자동 삽입 (비면 [자리표시])
- "초안 · 법률 검토 필요" 표시는 관리자에게만
- 버전: `legal_versions` (문서별 최신 = 시행일 → 등록 순). terms·privacy 최신 버전과 `profiles.terms_version / privacy_version` 이 다르면 전체 화면 재동의 창 (법적 문서·Sign Out 만 가능)
- 가입: 동의 체크 필수 → `accept_legal()`. 충전 결제: Credit & Refund Policy 읽음 체크 필수
- 계정 삭제: Profile → `request_account_deletion()` → 관리자 Customers 탭에서 처리 (실제 삭제는 Supabase 대시보드에서 수동)
- 모든 화면 아래 푸터: Terms · Privacy · Credit & Refund Policy · © 2026 회사명 (`renderFooters()`)

## 매출 대시보드 (sql/004_finance.sql, 설정 안내: FINANCE_SETUP.md)
- Admin → Dashboard = 맨 위 월 선택(◀ 월 ▶, 주문·매출 같이 사용) + "Orders" 구역 + "Revenue" 구역
- 집계는 DB 함수만 (관리자 전용, 방콕 시간 기준 달, month 는 1~12): `admin_finance_month`, `admin_finance_trend`, `admin_outstanding_credits`, `admin_topups_export`
- 입금 = 승인일(reviewed_at) 기준 VAT 포함 total. 사용 가치 = `credit_lot_usage`(restored_at 없음) × 묶음 unit_price (VAT 별도)
- 현금 환불 금액은 `credit_history.amount_thb` (004 에서 추가, `admin_refund_cash` 가 저장)
- 002 를 다시 실행하면 004 도 다시 실행 (admin_refund_cash 가 예전 모양으로 돌아가서)
- CSV: UTF-8 BOM, 금액은 쉼표 없는 숫자, Tax ID 는 `="..."`, 수식 주입 방지(' 붙임), 파일명 `allabut-topups-YYYY-MM.csv`

## 제외 (나중에)
- 세금계산서·영수증, 카드·온라인 자동 결제

## 스택
- Vanilla JS, HTML / CSS (Tailwind 는 쓰지 않음 — 직접 만든 CSS)
- Supabase (CDN, `@supabase/supabase-js@2.45.4` 고정): Auth, DB, Storage
- Three.js `three@0.160.0` — 파일 뷰어를 **열 때만** 동적으로 불러옴

## 파일 구조 (로직과 화면 분리)
- `index.html` — 화면 틀 3개 (landing / auth / app), 스크립트 순서
- `config.js` — Supabase 주소·공개 키, 사이트 주소 `SITE_URL`
- `build.sh`, `404.html`, `_redirects`, `_headers` — Cloudflare Pages 배포용 (위 "배포 · 도메인")
- `lang.js` — `t()`, `tf('키', {n:3})`, `setLang()`, RTL 처리, 날짜·숫자 표시
- `lang/lang-en.js ~ lang-fa.js` — 9개 언어 (키 이름은 모두 같음). 위쪽은 allAbut 문구, 아래쪽은 Dentalk 에서 가져온 CNC 문구
- `auth.js` — 회원가입(닉네임, 치과 이름·전화 선택) / 로그인 / `getProfile()`
- `session.js` — 1시간 세션 + 연장(최대 3시간) + 5분 전 경고. 로그아웃돼도 작성 중 주문은 유지
- `app.js` — `APP { user, profile, balance }`, 화면 전환, 로그인 폼, 시작(boot)
- `cnc/cnc-data.js` — 브랜드 11종, VITA 14색, 주문 단계, FDI 32개, `getToothName()`, 파일 규칙
- `cnc/cnc-core.js` — 화면 코드 없는 순수 로직: draft 저장/복원, 단계별 검사, 파일 규칙, cases 만들기, 업로드, 제출(RPC), 주문 조회, 고객 액션, 크레딧, 프로필 저장
- `cnc/cnc-viewer.js` — 파일 뷰어 (STL·OBJ 3D, 이미지, PDF), 서명 URL
- `ui/layout.js` — 헤더, 모바일 하단 탭, 공통 부품 (`escHtml`, 토스트, 모달, 확인창, 에러 글씨, 상태 배지, 진행 막대), 헤더 자동 맞춤 `fitHeader()`
- `ui/line-connect.js` — LINE 연결 공통 부품 (헤더 버튼, 안내 띠, 연결 모달·자동 확인, Profile 섹션, 완료 카드, QR 라이브러리)
- `ui/router.js` — 해시 라우팅 `#/home`, `#/guide`, `#/new`, `#/orders`, `#/profile`, `#/topup`, `#/admin`, `#/terms`, `#/privacy`, `#/credit-policy` (새로고침해도 같은 페이지)
- `ui/datepicker.js` — 자체 달력 `uiDateField({ id, value, min, onChange })` / `uiDateValue(id)`. 앱의 모든 날짜 입력은 이것만 쓴다 (`<input type="date">` 금지: 브라우저 언어를 따라가서)
- `cnc/cnc-legal.js` — 법적 문서 불러오기·버전·동의·회사 정보·삭제 요청 (로직만)
- `ui/page-legal.js` — 법적 문서 페이지 (목차, 섹션 번호, 버전·시행일, 연락처, 인쇄)
- `cnc/promptpay.js` — PromptPay QR 페이로드(EMVCo + CRC16), `promptPayPayload(id, amount)`
- `ui/page-topup.js` — 크레딧 충전 `#/topup` (패키지 → QR·계좌 → 슬립 → 완료, 내 충전 내역)
- `ui/page-guide.js` — 사용 매뉴얼 `#/guide` (문구 `guide_...`, 새 주문 "? Help" 팝오버도 `guide_stepN_text` 재사용)
- `ui/page-home.js`, `ui/page-new.js`, `ui/page-orders.js`, `ui/page-profile.js`
- `cnc/cnc-admin.js` — 관리자 로직 (화면 코드 없음): 대시보드 집계, 주문 목록·상세, 단계 처리, 디자인 업로드, 배송, 취소·환불, 고객·크레딧
- `ui/page-admin.js` — 관리자 화면 `#/admin/orders`, `#/admin/topups`, `#/admin/customers`, `#/admin/dashboard`, `#/admin/settings`
- `cnc/cnc-finance.js` — 매출 집계 RPC 호출, CSV 만들기·내려받기 (로직만)
- `ui/page-admin-finance.js` — Dashboard 의 Revenue 구역 (`PageAdmin` 에 함수 덧붙임: 카드, ? 설명, 패키지 표, 상위 고객, SVG 그래프, CSV 버튼)
- `css/landing.css` (공통 변수 + 랜딩·로그인·세션 팝업), `css/app.css` (앱 화면)

## 사용 흐름 규칙
- 로그인(재로그인 포함) 성공 → 항상 `#/home`. 이 계정 첫 로그인이면 한 번 `#/guide` (`localStorage.allabut_guide_seen_{user_id}`). 로그인 상태 새로고침은 지금 페이지 유지
- Sign Out → 앱 확인 모달 (작성 중 주문이 있으면 "저장되어 있어요" 안내). 세션 만료 자동 로그아웃은 확인 없음
- 작성 중 주문(draft)이 있으면 새 주문 맨 위에 "이어서 하기 / 삭제" 카드, 고르기 전엔 입력 잠금. 홈의 안내 바도 같은 동작
- 환자 ID 필수 (앞뒤 공백 제거, 최대 50자). "Anonymous" 기본값 없음
- 가공(milling) 시작 후 취소 불가 — 고객 취소는 submitted 에서만, 관리자 Cancel & refund 는 submitted ~ approved 에서만. DB 트리거 `prevent_late_cancel` → 에러 `CANNOT_CANCEL_AFTER_MILLING`

## 규칙
- 사용자가 입력한 값은 HTML 에 넣을 때 **항상 `escHtml()`** (XSS 방지)
- 화면 글자는 전부 번역 키로 (`t()` / `tf()`), 새 키는 9개 언어 파일에 모두 추가
- 크레딧·주문 쓰기는 브라우저에서 테이블에 직접 하지 않고 **DB 함수(RPC)** 로만
  (`create_cnc_order`, `update_my_cnc_order`, `cancel_my_cnc_order`, `customer_cnc_action`)
- 파일은 비공개 버킷 `cnc-files` 의 `{user_id}/{uploadId}/{번호}_{안전한파일명}` 에 올리고,
  `cases[0].stls`(원래 이름) + `cases[0].stlPaths`(경로) 에 저장. 업로드 실패 시 base64 대체 금지
- 보기용 주소는 `createSignedUrl` (1시간). 디자인 파일은 `cnc-designs` 버킷
- 작성 중 주문(draft): `localStorage.allabut_cnc_draft_{user_id}` (파일은 이름만 저장)
- 화면 폭: 모바일 → 1024px 이상 PC(헤더 메뉴, 새 주문 3단) → 1440px 이상 헤더 오른쪽 전체 (그 아래는 ☰ 메뉴)
- 헤더가 한 줄에 안 들어가면 `fitHeader()` 가 단계적으로 줄임 (언어·글자 크기·관리자 메뉴·잔액 자릿수에 따라 자동):
  fit-1 LINE 버튼 "LINE" 만 → fit-2 오른쪽 전체를 ☰ 메뉴로 → fit-3 Top up 을 ☰ 메뉴로 → fit-4 메뉴 간격 좁게 → fit-5 로고 작게 → fit-6 위쪽 메뉴 대신 아래 탭 + 5μm 숨김.
  헤더에 새 버튼을 넣으면 360px·1024px·1440px 에서 넘치지 않는지 꼭 확인

## 관리자 화면
- 로그인할 때 `sb.rpc('is_admin')` → `APP.isAdmin`. 관리자만 헤더·하단 탭에 골드 "Admin" 메뉴
- 관리자가 아닌 사람이 `#/admin` 으로 오면 `#/home` 으로 (화면에서 숨기는 것은 편의, 실제 보호는 DB 규칙)
- 단계 처리는 `cnc_orders` 직접 update (관리자 update 정책) + `updated_at`,
  `review_history` 에 `{ action, note, date, by: 'admin' }` 추가.
  update 할 때 "지금 단계"도 조건으로 걸어서, 그 사이 바뀌었으면 `STAGE_CHANGED` 에러
- 디자인 파일: `cnc-designs/{고객 user_id}/{주문번호}/v{버전}_...` →
  `design_versions` 에 `{ version, paths: [...], names: [...], date }` → stage = `design_ready`
- 취소·환불은 가공 전 단계만 (`submitted ~ approved`), `admin_cancel_cnc_order` RPC
- 크레딧 충전/차감: `admin_add_credits(p_user, p_amount, p_description)`
- 주의: DB 읽기 규칙이 "자기 것 또는 관리자"라서, 고객용 조회(내 주문·크레딧 이력)는 항상 `user_id = 내 id` 로 거른다

## LINE 알림 (Supabase Edge Function — 배포 방법은 `LINE_SETUP.md`)
- `supabase/functions/line-webhook/index.ts` — LINE → 서버. x-line-signature 검증, 친구추가 안내, 연결 코드(AB-XXXX) → `profiles.line_user_id` 저장
- `supabase/functions/line-notify/index.ts` — DB Webhook → LINE. 헤더 `x-notify-secret` 확인, 관리자(영어)·고객(9개 언어) Flex 카드
- **비밀값은 코드·저장소에 절대 쓰지 않는다.** Edge Function 안에서 `Deno.env.get()` 으로만 (Secrets: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, LINE_ADMIN_USER_ID, NOTIFY_SECRET).
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
- 테이블: `profiles`(+ clinic_name, address, phone, tax_id, line_user_id, lang), `admins`, `credit_wallets`,
  `credit_history`, `cnc_orders`, `invoices` — SQL 은 `CNC_PORT_PLAN.md` 6장
- `guilds` 테이블, `profiles.avatar` 컬럼은 DB 에 남아 있지만 코드에서는 쓰지 않는다
