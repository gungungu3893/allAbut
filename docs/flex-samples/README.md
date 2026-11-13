# LINE 알림 카드 샘플 (영수증 스타일)

`supabase/functions/line-notify/index.ts` 가 실제로 보내는 카드를 그대로 저장한 파일이에요.
사이트에는 올라가지 않아요 (`build.sh` 목록에 없음).

## 미리 보는 방법
1. https://developers.line.biz/flex-simulator/ 를 열고 LINE 계정으로 로그인
2. 오른쪽 위 **View as JSON** → 아래 표의 `.json` 파일 내용을 통째로 붙여넣기 → **Apply**
   - `NN-이름.json` = 카드 본문(bubble)만 → 시뮬레이터에 붙이는 파일
   - `NN-이름.message.json` = altText(알림 미리보기 글자)까지 들어간 전체 메시지 (Messaging API 로 보낼 때 모양)
3. 로고 이미지(`https://allabut.com/assets/brand/line-icon.png`)는 사이트에 배포된 뒤에 보여요

| 파일 | 내용 | 받는 사람 |
|---|---|---|
| `01-new-order-admin` | 새 주문 (파랑 제목, 치아 3개, 크레딧 잔액) | 관리자 |
| `02-order-cancelled-admin` | 고객이 주문 취소 (빨강 제목, 환불 줄) | 관리자 |
| `03-order-cancelled-customer` | allAbut 이 주문 취소 (빨강 제목, 취소 사유, 환불, 잔액) | 고객 |
| `04-design-review-customer` | 디자인 확인 요청 (네이비 제목, 안내 글) | 고객 |
| `05-shipped-customer` | 배송 시작 (택배사·송장번호) | 고객 |
| `06-topup-completed-customer` | 충전 완료 (충전 크레딧, 결제 금액, 유효기간, 잔액) | 고객 |
| `07-topup-request-admin` | 충전 요청 (패키지·단가·공급가액·VAT 7%·합계) | 관리자 |
| `08-customer-copy-unlinked` | 고객 알림 사본 — LINE 미연결 고객 (윗줄 "COPY" 배지, "● " 빨간 경고 + 전화번호) | 관리자 |
| `09-shipped-customer-th` | 배송 시작 — 태국어 고객 | 고객 |
| `10-free-credits-customer` | 🎁 무료 크레딧 지급 (크레딧 수 · 이벤트 · 유효기간 · 등록 주소 전용 안내 · 주문하기 버튼) | 고객 |
| `11-free-credits-copy-admin` | 🎁 무료 크레딧 지급 사본 (이벤트 · 배송 제한 · 지급한 직원) | 관리자 |

## 버튼 링크
모든 버튼은 `https://allabut.com/?openExternalBrowser=1#/…` 형식이에요 (LINE 안의 작은 브라우저 대신 휴대폰 기본 브라우저로 열려요).
주문 카드는 그 주문으로 바로 가요: 고객 `#/orders?id=CA…` (자동으로 펼침) / 관리자 `#/admin/orders?order=CA…` (상세 창이 열림).

## 카드 구조 v2 (모든 알림 공통 — `buildReceiptCard()`)
1. **맨 위 4px 색 띠** (header) — 그 알림의 제목 색
2. 윗줄: 로고 28px + "allAbut" (네이비) … 사본이면 오른쪽 회색 **COPY** 배지
3. 제목 (`xl` bold, 알림 색, 왼쪽) → 한 줄에 문서번호(왼쪽) · 날짜(오른쪽, `13 NOV 2026 · 11:11 AM`)
4. 안내 문장(있을 때만) → 구분선
5. 섹션들 (Clinic / Case / Teeth / Details / Shipping …) — **섹션 사이엔 구분선 없이 여백만**
6. 구분선 → 합계: 작은 줄 → 큰 줄(`Credit balance` 또는 `Total ฿…`, 값 `xxl`) → `Paid n · Free n`
7. 하단: 네이비 버튼(흰 글씨) + 회색 안내 두 줄 (자동 알림 문구 · 회사명 · Tax ID · allabut.com)

## 글자 · 여백 규칙 (Flex 값)
| 부분 | Flex 값 |
|---|---|
| 카드 | bubble `mega`, header 4px 색 띠(`paddingAll 0px`), body `paddingAll xl`, footer `paddingAll xl` · `paddingTop 0px` |
| 윗줄 | 로고 image `28px` flex 0 · "allAbut" `sm` bold `#001D4A` (`margin md`) · filler · COPY 배지(`#F3F4F6`, 모서리 4px, 글씨 `xxs` bold `#4B5563`) |
| 제목 / 문서번호 · 날짜 | 제목 `xl` bold 알림 색 (`margin xl`) / 문서번호 `xs` bold `#374151` · 날짜 `xs` `#6B7280` (`margin sm`) |
| 안내 문장 | `sm` `#374151` (`margin lg`) → separator `#E5E7EB` (`margin xl`) |
| 섹션 | 상자마다 `margin xxl`, 제목 `md` bold `#111827`, 첫 내용 `margin md` |
| Clinic | 이름 `sm` bold `#111827` + 회색 `sm` 최대 2줄 (주소 / "전화 · 이메일"), LINE 미연결 = "● " + `sm` `#B91C1C` (`margin md`) |
| 항목 줄 | 라벨 `sm` regular `#6B7280` flex 4 / 값 `sm` regular `#111827` 오른쪽 flex 6 wrap, 줄 사이 `md`, 들여쓰기 없음. 날짜 값은 `20 Nov 2026` |
| 치아 줄 | 번호 `sm` bold `#111827` flex 2 / 브랜드 `sm` `#6B7280` flex 6 / 쉐이드 `sm` `#111827` 오른쪽 flex 2 |
| 합계 | separator (`margin xxl`) → 상자 (`margin xl`): 작은 줄 = 항목 줄 / 큰 줄 라벨 `md` bold · 값 `xxl` bold 오른쪽 flex 0 (`margin lg`) / "Paid n · Free n" `xs` `#6B7280` 오른쪽 |
| 하단 | 버튼 `#001D4A` 모서리 8px · 글씨 `sm` bold `#FFFFFF` / 안내 `xxs` `#9CA3AF` (`margin lg` · `xs`) |

샘플 다시 만들기: 가짜 서버로 실제 함수를 돌려서 저장해요 (개발용 스크립트, 저장소 밖).

※ 샘플의 회사명·Tax ID·치과·환자 값은 예시예요. 실제 카드는 `company_settings` 와 주문 값으로 채워져요.
