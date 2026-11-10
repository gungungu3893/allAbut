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
| `08-customer-copy-unlinked` | 고객 알림 사본 — LINE 미연결 고객 (회색 "COPY OF CUSTOMER NOTICE", 빨간 경고 + 전화번호) | 관리자 |
| `09-shipped-customer-th` | 배송 시작 — 태국어 고객 | 고객 |
| `10-free-credits-customer` | 🎁 무료 크레딧 지급 (크레딧 수 · 이벤트 · 유효기간 · 등록 주소 전용 안내 · 주문하기 버튼) | 고객 |
| `11-free-credits-copy-admin` | 🎁 무료 크레딧 지급 사본 (이벤트 · 배송 제한 · 지급한 직원) | 관리자 |

## 버튼 링크
모든 버튼은 `https://allabut.com/?openExternalBrowser=1#/…` 형식이에요 (LINE 안의 작은 브라우저 대신 휴대폰 기본 브라우저로 열려요).
주문 카드는 그 주문으로 바로 가요: 고객 `#/orders?id=CA…` (자동으로 펼침) / 관리자 `#/admin/orders?order=CA…` (상세 창이 열림).

## 카드 구조 (모든 알림 공통 — `buildReceiptCard()`)
1. 상단 가운데: 로고 아이콘 → 제목(종류별 색 글씨) → `allAbut · Order notice` → 문서번호 → 날짜·시간(방콕)
2. 섹션(있는 것만): Clinic / Case / Teeth(최대 6줄 + "+n more") / 이벤트별 상세(배송·사유·처리자)
3. 합계: 작은 줄들 + 마지막 줄 크게 (`Credit balance` 또는 `Total ฿…`)
4. 하단: 테두리 버튼 + "This is an automatic notification from allAbut." + 회사명 · Tax ID · allabut.com

※ 샘플의 회사명·Tax ID·치과·환자 값은 예시예요. 실제 카드는 `company_settings` 와 주문 값으로 채워져요.
