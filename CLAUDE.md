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
- 랜딩(첫 화면): 상단 메뉴 줄(작은 로고 · 회사소개 · 언어 · 골드 테두리 "로그인") + 가운데 큰 로고 `.logo-hero`(`clamp(40px, 11vw, 72px)`, 안의 비율 em 그대로) + 슬로건 + 이벤트 배너 + 푸터.
  가운데 Start Order 버튼·About 링크는 없앴어요 (로그인은 상단 버튼 `handleStartOrder()` 하나). 메뉴 줄 작은 로고·로그인 화면·앱 헤더 로고 크기는 그대로
- 로고 불꽃 인트로 `ui/logo-intro.js` (`LogoIntro`): A 꼭짓점 → 금빛 불씨 → 터짐(빛줄기 꼬리) → 빛이 모여 5μm → 진짜 글자 + 빛나는 선(`.logo-um.shine`).
  랜딩이 보일 때 탭(세션)당 1번 (`sessionStorage.allabut_intro_played`, app.js 의 `showScreen('landing')` 이 페이드인 뒤 `LogoIntro.maybePlay()`), 랜딩을 떠나면 `LogoIntro.stop()`.
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
  - 주문 취소는 원래 묶음으로 복구 → restriction 그대로. 크레딧은 커스텀 어버트먼트 주문에만 써요 (다른 상품 없음)
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
- **SQL 재실행 순서 (전체)**: 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012.
  **008 을 다시 실행하면 009 → 010 → 012 도 다시** (create_cnc_order 가 008 모양 = 주문할 때 deadline 저장으로 돌아가서)

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

## 잔액 나눠 보기: 💳 충전(Paid) · 🎁 무료(Free) (sql/011_admin_credit_split.sql)
- **헤더는 전체 잔액만** (배지·팝오버 없음). 그 밖의 잔액이 보이는 곳은 전부 충전 / 무료를 나눠서, 항상 둘 다(0 이어도)
- 기준은 이미 있는 값만: `APP.purchasedCredits`(충전) / `APP.freeTotal`(무료 = 등록 주소 전용 + 제한 없는 무료) ← `get_my_credit_summary()`.
  요약 함수가 없으면(008 전) 전부 충전 (`APP.creditSummaryOk === false`)
- 공통 부품 `ui/layout.js`: `uiCreditSplitHtml({ expiry, note, paid, free, ... })` ("💳 충전 n · 🎁 무료 n", 숫자만 `.mono`, `expiry` = 종류마다 가장 빠른 만료일, `note` = 등록 주소 전용 무료 안내).
  값을 직접 넘기지 않은 부품은 `refreshBalance()` 때 `uiRefreshCreditSplits()` 로 자동 갱신. `setBalance()` 도 뒤에서 `refreshBalance()` 를 불러 나눔을 서버 값으로 맞춰요
- 묶음 종류 `cncLotKind(lot)` (요약과 같은 규칙: paid = 제한 없음 + 무료 출처 아님), 이력 줄 종류 `cncCreditHistoryKinds(rows)` (lot_id → 묶음 / 주문 줄 → bonus_used·credits_used / 그 밖 → 무료 설명이면 무료) → 배지 `uiCreditKindBadge`
- 표시 위치: 홈 크레딧 카드(만료일 + 안내) · Profile · 충전 · 새 주문 요약/5단계(이번 차감 + "주문 후 잔액") · 주문 완료 · 내 주문 상세(`uiOrderCreditUseHtml(credits_used, bonus_used)`) · 이력·묶음 배지
  - "주문 후 잔액"은 미리보기: 무료 몫은 무료에서, 나머지는 충전에서 먼저 (제한 없는 무료가 있으면 실제 DB 차감 순서와 조금 다를 수 있어요 — 주문 뒤엔 서버 값)
- 관리자: Customers 목록 "💳 충전 / 🎁 무료" 두 칸, 고객 상세 나눔 + 이력·묶음 배지 ← `admin_credit_split(p_users)` (manager, sql/011). 011 실행 전이면 전부 충전
- LINE: 고객 카드 · 사본 카드의 "Credit balance" 아래 작은 줄 "Paid n · Free n" (R 문구 `split_paid` · `split_free`, `getCreditSplit` 이 credit_lots 에서 같은 규칙으로). 관리자 새 주문 카드는 없음

## 회원 필수 정보 · 중복 · 신규 가입 이벤트 · Turnstile (sql/010_signup_identity_campaign.sql)
- **필수 5개**: 본명(`profiles.full_name`) · 전화 · 치과명 · 치과 Tax ID(13자리 + 태국 체크섬) · 치과 주소. 회원가입 폼은 칸마다 빨간 글씨(`[data-su-err]`), 닉네임 칸 없음(닉네임 = 본명)
- **정규화는 SQL 과 JS 가 똑같이** (`cnc/cnc-identity.js` ↔ `_norm_phone` / `_norm_tax_id` / `_valid_tax_id`): 전화 = 숫자만 + `+66`/`66` → `0`, Tax ID = 숫자만, 체크섬 = (11 − Σ d[i]·(13−i) % 11) % 10. **한쪽을 바꾸면 다른 쪽도**
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
- **비밀번호 찾기**: 로그인 폼 "비밀번호를 잊으셨나요?" → `#form-reset` (`sendPasswordReset`, redirectTo = `SITE_URL/`) → 메일 링크로 오면 `window.__passwordRecovery` → `#form-newpass` (`updatePassword`) → 로그아웃 후 다시 로그인
- **Cloudflare Turnstile**: `config.js` 의 `TURNSTILE_SITE_KEY` (비어 있으면 위젯 숨김, 예전처럼 동작). 회원가입·로그인·비밀번호 찾기 폼의 `.ts-box[data-ts]` (`ui/turnstile.js`), 토큰은 `captchaToken` 으로 Supabase Auth 에 전달, 호출 뒤 `tsReset`.
  **시크릿 키는 코드에 절대 넣지 않는다** → Supabase → Authentication → Bot and Abuse Protection 에만
- 재실행 순서: 002 → 008 → 009 → 010 → 012 (008 을 다시 실행하면 009 → 010 → 012 도)

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
- 순서: Hero → 01 About → 02 Why allAbut(강점 5개, 선 아이콘 SVG `ABOUT_ICONS`) → 03 Products(`ABOUT_PRODUCTS`, img 를 채우면 사진 자리 생김) → 04 How to order(`wiz_step1~5` 재사용) → 05 Delivery & guarantee → 06 Contact
- 섹션 번호 01~ 은 보이는 섹션만 순서대로. 값이 빈 줄·칩·섹션은 숨김
- 규격 글자(`ABOUT_SPEC_TOKENS`: 5μm, ASTM F136, Grade 23, Ti-6Al-4V ELI, ISO 13485)는 번역문 안에서 찾아 Mono 골드 → **번역할 때 이 글자는 그대로 둔다**
- 회사 값은 `company_settings` 만 (`cncCompanyProfile(lang)`): founded_year, implant_brands(쉼표), lead_time·delivery·remake_policy (jsonb `{en, th, ko, ...}`, 지금 언어 → en 순으로, `cncLocalizedText`)
- 관리자 Settings → Company info 아래 "About page" 칸 (en/th/ko 입력, 다른 언어 값은 저장할 때 보존). 007 실행 전이면 안내만 보이고 기존 칸 저장은 그대로 동작 (`cncHasCompanyProfile()`)
- SEO: 페이지가 열려 있는 동안 title·description·og 태그(언어별, og:url 은 `SITE_URL`) + JSON-LD Organization, 떠나면 원래대로
- 스크롤 등장 애니메이션은 IntersectionObserver + `.about-animate` (prefers-reduced-motion 이면 안 붙임)
- 들어가는 곳: PC 위쪽 메뉴 줄 "홈" 바로 오른쪽(`NAV_ITEMS` 의 about, `noTab`), 모바일은 ☰ 메뉴 맨 위 첫 항목(하단 탭에는 없음, PC 에서 fit-7 로 아래 탭을 쓸 때만 탭에도),
  랜딩 상단 메뉴 줄(로고 · 회사소개 · 언어 · 로그인), 로그인 전 헤더(로고 옆), 푸터 맨 앞 "About".
  #/about 이면 메뉴가 굵게 + 골드 밑줄 (`setActiveNav`, 로그인 전 화면도). 좁은 화면(420px 미만)은 로고 · 회사소개 · 로그인 한 줄 + 언어 선택은 둘째 줄

## 매출 대시보드 (sql/004_finance.sql, 설정 안내: FINANCE_SETUP.md)
- Admin → Dashboard 순서: ① "지금 처리할 일" (대기 중 충전 요청 / 접수 대기 주문 / 기한 임박 — 누르면 그 탭·필터로)
  → ② "현재 현황" (단계별 카드, 기한 임박 목록) → ③ 구분선 + ◀ 월 ▶ + "월별 통계" ([주문 | 매출] 탭 전환, 매출은 owner 만)
- 섹션 제목은 얇은 글자 + 아래 골드 선 (`.dash-section-title`), 전환은 밑줄 탭 (`.dash-tab`)
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
- `auth.js` — 회원가입(본명 · 전화 · 치과명 · Tax ID · 주소 필수, captchaToken) / 로그인 / 비밀번호 재설정 / `getProfile()`
- `cnc/cnc-identity.js` — 필수 정보 정규화·검사(전화 · Tax ID 체크섬 · 일회용 메일), 가입 전 확인, 기기 ID, 가입 기록, 신규 가입 이벤트 안내 (로직만)
- `ui/turnstile.js` — Cloudflare Turnstile 위젯 (키가 있을 때만)
- `ui/logo-intro.js` — 랜딩 큰 로고(`.logo-hero`) 불꽃 인트로 (탭당 1번, `LogoIntro.maybePlay()` / `stop()`)
- `ui/page-complete.js` — 필수 정보 입력 `#/complete`
- `session.js` — 1시간 세션 + 연장(최대 3시간) + 5분 전 경고. 로그아웃돼도 작성 중 주문은 유지
- `app.js` — `APP { user, profile, balance }`, 화면 전환, 로그인 폼, 시작(boot)
- `cnc/cnc-data.js` — 브랜드 11종, VITA 14색, 주문 단계, FDI 32개, `getToothName()`, 파일 규칙
- `cnc/cnc-core.js` — 화면 코드 없는 순수 로직: draft 저장/복원, 단계별 검사, 파일 규칙, cases 만들기, 업로드, 제출(RPC), 주문 조회, 고객 액션, 크레딧, 프로필 저장
- `cnc/cnc-viewer.js` — 파일 뷰어 (STL·OBJ 3D, 이미지, PDF), 서명 URL
- `ui/layout.js` — 헤더, 모바일 하단 탭, 공통 부품 (`escHtml`, 토스트, 모달, 확인창, 에러 글씨, 상태 배지, 진행 막대), 헤더 자동 맞춤 `fitHeader()`
- `ui/line-connect.js` — LINE 연결 공통 부품 (헤더 버튼, 안내 띠, 연결 모달·자동 확인, Profile 섹션, 완료 카드, QR 라이브러리)
- `ui/router.js` — 해시 라우팅 `#/home`, `#/guide`, `#/new`, `#/orders`, `#/profile`, `#/topup`, `#/admin`, `#/terms`, `#/privacy`, `#/credit-policy`, `#/contact`, `#/about`, `#/complete`(필수 정보가 비었을 때만) (새로고침해도 같은 페이지). 로그인 없이 열리는 곳은 `isPublicRoute()` (법적 문서 + contact + about)
- `ui/datepicker.js` — 자체 달력 `uiDateField({ id, value, min, onChange })` / `uiDateValue(id)`. 앱의 모든 날짜 입력은 이것만 쓴다 (`<input type="date">` 금지: 브라우저 언어를 따라가서)
- `cnc/cnc-legal.js` — 법적 문서 불러오기·버전·동의·회사 정보·삭제 요청 (로직만)
- `ui/page-legal.js` — 법적 문서 페이지 (목차, 섹션 번호, 버전·시행일, 연락처, 인쇄)
- `ui/page-contact.js` — 문의하기 `#/contact` (로그인 전·후 공통, 연락처는 company_settings)
- `ui/page-about.js` — 회사소개 `#/about` (로그인 전·후 공통, 회사 값은 company_settings)
- `cnc/promptpay.js` — PromptPay QR 페이로드(EMVCo + CRC16), `promptPayPayload(id, amount)`
- `ui/page-topup.js` — 크레딧 충전 `#/topup` (패키지 → QR·계좌 → 슬립 → 완료, 내 충전 내역)
- `ui/page-guide.js` — 사용 매뉴얼 `#/guide` (문구 `guide_...`, 새 주문 "? Help" 팝오버도 `guide_stepN_text` 재사용)
- `ui/page-home.js`, `ui/page-new.js`, `ui/page-orders.js`, `ui/page-profile.js`
- `cnc/cnc-admin.js` — 관리자 로직 (화면 코드 없음): 대시보드 집계, 주문 목록·상세, 단계 처리, 디자인 업로드, 배송, 취소·환불, 고객·크레딧
- `ui/page-admin.js` — 관리자 화면 `#/admin/orders`, `#/admin/topups`, `#/admin/customers`, `#/admin/dashboard`, `#/admin/activity`, `#/admin/team`, `#/admin/settings` (역할에 따라 보이는 탭이 달라요)
- `cnc/cnc-finance.js` — 매출 집계 RPC 호출, CSV 만들기·내려받기 (로직만)
- `ui/page-admin-finance.js` — Dashboard 의 Revenue 구역 (`PageAdmin` 에 함수 덧붙임: 카드, ? 설명, 패키지 표, 상위 고객, SVG 그래프, CSV 버튼)
- `cnc/cnc-team.js` — 역할(`cncHasRole`, `cncLoadAdminMe`), 팀 관리, 작업 기록 조회, 관리자 LINE 그룹·그룹 코드 (로직만)
- `ui/page-admin-team.js` — Team 탭, Activity 탭, Settings 의 LINE groups 섹션 (`PageAdmin` 에 덧붙임)
- `ui/page-admin-free.js` — 무료 크레딧 사용 배지, 무료 크레딧 지급·회수, 신규 가입 이벤트 설정, 등록 치과 정보 변경 요청 승인 (`PageAdmin` 에 덧붙임, sql/008·009)
- `css/landing.css` (공통 변수 + 랜딩·로그인·세션 팝업), `css/app.css` (앱 화면)

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

## 사용 흐름 규칙
- 로그인(재로그인 포함) 성공 → 항상 `#/home` (예외: 로그인 전에 LINE 알림 링크로 들어왔으면 로그인 후 그 페이지로 — 아래 LINE 링크). 이 계정 첫 로그인이면 한 번 `#/guide` (`localStorage.allabut_guide_seen_{user_id}`). 로그인 상태 새로고침은 지금 페이지 유지
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
  fit-1 LINE 버튼 "LINE" 만 → fit-2 오른쪽 전체를 ☰ 메뉴로 → fit-3 Top up 을 ☰ 메뉴로 → fit-4 메뉴 간격 좁게 → fit-5 로고 작게 → fit-6 메뉴 글자 조금 작게 + 가이드 아이콘·역할 글자·크레딧 단위 숨김 → fit-7 위쪽 메뉴 대신 아래 탭(회사소개 탭 포함) + 5μm 숨김.
  헤더에 새 버튼을 넣으면 360px·1024px·1440px 에서 넘치지 않는지 꼭 확인

## 팀 권한 · 작업 기록 (sql/005_team.sql, 설정 안내: TEAM_SETUP.md)
- 역할: owner ⊃ manager ⊃ staff (`admins.role`). DB: `admin_role()`, `has_admin_role(p_min)`, `is_admin()` = 역할이 있으면 true (예전 규칙 호환)
  - staff: 주문 조회·단계 변경·디자인 업로드·배송 (cnc_orders, cnc-files·cnc-designs), Activity
  - manager: + 충전 승인/거절, 크레딧 지급/차감, 주문 관리자 취소, 고객 목록·프로필·돈 정보, 계정 삭제 요청, Dashboard 주문 통계
  - owner: + 현금 환불, 가격·결제·회사 정보·법적 버전 수정, 매출(admin_finance_*), Team, LINE 그룹
- 005 는 기존 관리자 함수 정의 안의 `is_admin()` 만 `has_admin_role('…')` 로 바꿔 끼워요 → **002·003·004 를 다시 실행하면 005 도 다시**
- 새 관리자 함수를 만들 때는 처음부터 `has_admin_role('필요한 역할')` 로 확인하고, 화면은 `cncHasRole('…')` 로 버튼·탭을 숨긴다
- 화면: `APP.adminRole`, `APP.adminName` (로그인 때 `admin_me()`. 005 미실행이면 is_admin → owner 로 봄). `PageAdmin.TABS` 의 `min` 으로 탭 제한, 권한 없는 탭 주소는 Orders 로
- 팀 함수(owner): `admin_list_team`, `admin_add_member(email, role, name)`(가입한 이메일만, USER_NOT_FOUND), `admin_set_role`, `admin_set_member_name`, `admin_remove_member` (자기 자신·마지막 owner 불가: CANNOT_REMOVE_SELF / LAST_OWNER)
- 작업 기록 `admin_audit_log`: staff 이상 읽기, 쓰기는 트리거·함수만 (팀원이 한 일만 기록: 주문 단계·배송·디자인·관리자 취소, 충전 승인/거절, 크레딧 지급/차감, 현금 환불, 팀 변경, 설정 변경)
- `review_history` 의 관리자 기록은 `by: 'admin'` 그대로 + DB 트리거가 `by_name`·`by_id`(실제 처리자)를 붙임. 관리자 화면 타임라인만 이름 표시 (`uiHistoryList(history, true)`), 고객 화면은 "관리자"

## 관리자 화면
- 로그인할 때 `admin_me()` → `APP.adminRole` / `APP.isAdmin`. 팀원만 헤더·하단 탭에 골드 "Admin · 역할" 메뉴
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
  - **카드 모양 = 영수증 스타일, 모든 알림이 `buildReceiptCard()` 하나** (관리자·사본·고객 공통, 흰 바탕):
    상단 가운데 로고 아이콘(`SITE_URL/assets/brand/line-icon.png`, 192×192 PNG) → 제목(색은 글씨에만) → "allAbut · Order notice" → 문서번호 → 날짜·시간(방콕 "10 NOV 2026 / 08:59 AM") →
    섹션(있는 것만: Clinic / Case / Teeth "#36 Osstem A2" 최대 6줄 + "+n more" / 이벤트별 상세) → 합계(작은 줄 + 마지막 줄 크게: 주문·크레딧 "Credit balance", 충전 "Total ฿…") →
    테두리 버튼 1개 + "This is an automatic notification from allAbut." + company_settings 회사명 · Tax ID · 사이트 주소
  - 만드는 함수: `orderReceipt()`(cnc_orders 의 cases·clinic·addr·phone·patient·deadline·credits_used + credit_wallets 잔액), `topupReceipt()`(topup_requests 의 credits·unit_price·subtotal·vat_amount·total), `creditReceipt()`
  - 제목 색: 관리자 = `ADMIN_NOTICE_STYLES` 의 종류별 색·제목(title) / 고객 = 네이비, 취소·충전 거절만 빨강. 글씨 #111827 · 회색 #6B7280 · 구분선 #E5E7EB
  - 사본: 문서번호 위 회색 "COPY OF CUSTOMER NOTICE", Clinic 섹션에 고객 이메일, LINE 미연결이면 그 아래 빨간 작은 글씨 + 전화번호, 처리자는 상세의 "Handled by"
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
- 테이블: `profiles`(+ clinic_name, address, phone, tax_id, line_user_id, lang), `admins`(+ role, display_name, added_by), `credit_wallets`,
  `credit_history`, `cnc_orders`, `invoices` — SQL 은 `CNC_PORT_PLAN.md` 6장
- `guilds` 테이블, `profiles.avatar` 컬럼은 DB 에 남아 있지만 코드에서는 쓰지 않는다
