# CLAUDE.md

## 브랜치
- 브랜치명: `main`

## Git Rules
- 작업 후 항상 아래 명령을 실행한다:
  ```bash
  git add . && git commit -m "메시지" && git push origin main
  ```

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

## 제외 (나중에)
- 세금계산서·영수증, 결제

## 스택
- Vanilla JS, HTML / CSS (Tailwind 는 쓰지 않음 — 직접 만든 CSS)
- Supabase (CDN, `@supabase/supabase-js@2.45.4` 고정): Auth, DB, Storage
- Three.js `three@0.160.0` — 파일 뷰어를 **열 때만** 동적으로 불러옴

## 파일 구조 (로직과 화면 분리)
- `index.html` — 화면 틀 3개 (landing / auth / app), 스크립트 순서
- `config.js` — Supabase 주소·공개 키
- `lang.js` — `t()`, `tf('키', {n:3})`, `setLang()`, RTL 처리, 날짜·숫자 표시
- `lang/lang-en.js ~ lang-fa.js` — 9개 언어 (키 이름은 모두 같음). 위쪽은 allAbut 문구, 아래쪽은 Dentalk 에서 가져온 CNC 문구
- `auth.js` — 회원가입(닉네임, 치과 이름·전화 선택) / 로그인 / `getProfile()`
- `session.js` — 1시간 세션 + 연장(최대 3시간) + 5분 전 경고. 로그아웃돼도 작성 중 주문은 유지
- `app.js` — `APP { user, profile, balance }`, 화면 전환, 로그인 폼, 시작(boot)
- `cnc/cnc-data.js` — 브랜드 11종, VITA 14색, 주문 단계, FDI 32개, `getToothName()`, 파일 규칙
- `cnc/cnc-core.js` — 화면 코드 없는 순수 로직: draft 저장/복원, 단계별 검사, 파일 규칙, cases 만들기, 업로드, 제출(RPC), 주문 조회, 고객 액션, 크레딧, 프로필 저장
- `cnc/cnc-viewer.js` — 파일 뷰어 (STL·OBJ 3D, 이미지, PDF), 서명 URL
- `ui/layout.js` — 헤더, 모바일 하단 탭, 공통 부품 (`escHtml`, 토스트, 모달, 확인창, 에러 글씨, 상태 배지, 진행 막대)
- `ui/router.js` — 해시 라우팅 `#/home`, `#/guide`, `#/new`, `#/orders`, `#/profile`, `#/admin` (새로고침해도 같은 페이지)
- `ui/datepicker.js` — 자체 달력 `uiDateField({ id, value, min, onChange })` / `uiDateValue(id)`. 앱의 모든 날짜 입력은 이것만 쓴다 (`<input type="date">` 금지: 브라우저 언어를 따라가서)
- `ui/page-guide.js` — 사용 매뉴얼 `#/guide` (문구 `guide_...`, 새 주문 "? Help" 팝오버도 `guide_stepN_text` 재사용)
- `ui/page-home.js`, `ui/page-new.js`, `ui/page-orders.js`, `ui/page-profile.js`
- `cnc/cnc-admin.js` — 관리자 로직 (화면 코드 없음): 대시보드 집계, 주문 목록·상세, 단계 처리, 디자인 업로드, 배송, 취소·환불, 고객·크레딧
- `ui/page-admin.js` — 관리자 화면 `#/admin/orders`, `#/admin/customers`, `#/admin/dashboard`
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
- 고객 화면: Profile 의 LINE notifications (친구추가 버튼·PC QR·연결 코드·상태 확인·해제), 홈의 작은 연결 안내

## Supabase
- 테이블: `profiles`(+ clinic_name, address, phone, tax_id, line_user_id, lang), `admins`, `credit_wallets`,
  `credit_history`, `cnc_orders`, `invoices` — SQL 은 `CNC_PORT_PLAN.md` 6장
- `guilds` 테이블, `profiles.avatar` 컬럼은 DB 에 남아 있지만 코드에서는 쓰지 않는다
