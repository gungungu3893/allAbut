# 크레딧 충전 · 유효기간 설정 안내 (초보자용)

이번에 추가된 것
- 고객: **Top up** 화면에서 패키지 선택 → PromptPay QR 로 결제 → 입금 슬립 올리기
- 관리자: **Admin → Top-ups** 에서 슬립 확인 후 승인/거절, **Admin → Settings** 에서 가격·결제 정보 수정
- 크레딧은 충전 묶음마다 **12개월** 유효, 먼저 만료되는 것부터 사용, 만료 30일·7일 전 LINE 알림

아래 순서대로 한 번만 해 주시면 돼요.

---

## 1. SQL 실행 (테이블 · 함수 · 예약 작업)

1. Supabase 대시보드 → 왼쪽 **SQL Editor** → **New query**
2. 저장소의 `sql/002_credit_topups.sql` 내용을 **통째로** 복사해서 붙여넣기
3. 오른쪽 아래 **Run**
4. 아래쪽에 `Success` 가 나오면 끝이에요.
   - 두 번 실행해도 괜찮아요 (같은 결과).
   - 이미 크레딧이 있던 고객은 그 잔액이 "이전 잔액(migration)" 묶음 1개로 바뀌고, **오늘부터 12개월** 유효해요.

### 확인 (선택)
SQL Editor 에서 아래를 실행하면 결과가 보여요.
```sql
select * from credit_packages order by credits;        -- 패키지 5개
select jobname, schedule from cron.job;                -- allabut-expire-credits, allabut-expiry-reminders
```

> pg_cron(예약 작업) 또는 pg_net(HTTP 호출)이 꺼져 있다는 안내가 나오면:
> **Database → Extensions** 에서 `pg_cron`, `pg_net` 을 검색해서 켠 다음 SQL 을 한 번 더 실행하세요.

---

## 2. Vault 에 NOTIFY_SECRET 넣기 (만료 예정 LINE 알림용)

매일 밤 예약 작업이 `line-notify` 함수를 부를 때 비밀 헤더(`x-notify-secret`)가 필요해요.
이 값은 SQL 파일에 쓰지 않고 **Vault** 에서 읽어요.

1. Supabase 대시보드 → **Project Settings** (톱니) → **Vault** (또는 왼쪽 메뉴 **Integrations → Vault**)
2. **Add new secret**
3. Name: `notify_secret` (정확히 이 이름, 소문자)
4. Secret: Edge Function Secrets 에 넣어 둔 `NOTIFY_SECRET` 과 **똑같은 글자**
5. **Save**

> 화면에서 찾기 어려우면 SQL Editor 에서 이렇게 넣어도 돼요 (값 부분만 바꿔서, 실행 후 이 쿼리는 지우세요):
> ```sql
> select vault.create_secret('여기에-NOTIFY_SECRET-값', 'notify_secret');
> ```

---

## 3. Database Webhook 3번째 만들기 (`topup_requests`)

1. Supabase → **Database** → **Webhooks** (또는 **Integrations → Database Webhooks**) → **Create a new hook**
2. 아래처럼 입력

| 칸 | 값 |
|---|---|
| Name | `line_notify_topups` |
| Table | `topup_requests` |
| Events | ✅ **Insert**, ✅ **Update** |
| Type of webhook | **Supabase Edge Functions** |
| Edge Function | `line-notify` |
| Method | `POST` |
| HTTP Headers | `x-notify-secret` = `NOTIFY_SECRET` 과 같은 값 |

3. **Create webhook**

(기존 `cnc_orders`, `credit_history` Webhook 은 그대로 두세요.)

---

## 4. line-notify 다시 배포

1. Supabase → **Edge Functions** → `line-notify`
2. 코드 편집 화면에서 기존 코드를 **전부 지우고** 저장소의 `supabase/functions/line-notify/index.ts` 를 통째로 붙여넣기
3. **Deploy**
4. (Verify JWT 는 계속 **OFF**)

새로 보내는 알림
- 💰 충전 요청 → 관리자 / ⚠️ 충전 거절 + 사유 → 고객 / 충전 요청 취소 → 관리자
- 💳 크레딧 충전 → 고객 (유효기간 표시)
- ⌛ 크레딧 만료 → 고객 / ⏰ "n개가 d일 후 만료" → 고객 (만료 30일·7일 전)

---

## 5. 결제 정보 입력 (관리자 화면)

1. 웹사이트에 관리자로 로그인 → **Admin** → **Settings** 탭
2. **Payment information**
   - **PromptPay ID**: 휴대폰 번호(예: `0812345678`) 또는 사업자번호 13자리
   - **VAT (%)**: `7`
   - **Bank / Account name / Account number**: 계좌이체용 정보
   - **Note**: 고객에게 보여줄 안내 (선택)
3. **Save**
4. **Credit packages** 표에서 가격을 바꾸거나 **Add package** 로 추가할 수 있어요.
   - 가격은 **개당, VAT 별도**
   - "On sale" 체크를 끄면 고객 화면에서 숨겨져요.

---

## 6. 테스트 순서

1. **고객 계정**으로 로그인 → 오른쪽 위 **Top up**
2. 10개 패키지 → **Choose** → 총액 `21,935.00 THB` 확인
3. 휴대폰 은행 앱으로 QR 을 스캔 → 받는 사람·금액이 맞는지 확인 (실제로 돈을 보내지 않아도 확인만 가능)
4. 아무 이미지를 슬립으로 올리고 **Submit payment** → 완료 화면 → 관리자 LINE 에 💰 알림
5. **관리자 계정** → Admin → **Top-ups** → 요청 클릭 → 슬립 확인 → **Approve**
   → 고객 LINE 에 💳 "크레딧 10개 충전 · 유효기간 …"
6. 고객 **Profile** → "Credits by top-up" 에 묶음과 만료일 표시
7. 다른 요청을 **Reject** (사유 입력) → 고객 LINE 에 ⚠️ + 사유, 고객 Top up 화면 내역에 사유 표시
8. 주문을 하나 제출했다가 취소 → 크레딧이 원래 묶음으로 돌아오는지 Profile 에서 확인
9. Admin → Customers → 고객 → **Refund calculator → Calculate** → 환불 가능 금액 확인

### 만료 기능을 바로 시험하고 싶으면 (선택, SQL Editor)
```sql
-- 테스트용 묶음 하나를 5일 뒤 만료로 바꾸고 → 알림 함수 실행
update credit_lots set expires_at = now() + interval '5 days', notified_7 = false, notified_30 = false
 where id = (select id from credit_lots where remaining > 0 order by created_at desc limit 1);
select public.send_credit_expiry_reminders();   -- 고객 LINE 에 ⏰ 알림

-- 만료 처리 시험 (지난 날짜로 바꾸고 실행)
-- update credit_lots set expires_at = now() - interval '1 minute' where id = '...';
-- select public.expire_credit_lots();
```

---

## 7. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 슬립 올리기에서 실패 | SQL 의 `topup-slips` 버킷이 만들어졌는지 (Storage 메뉴), 파일이 10MB 이하·이미지/PDF 인지 |
| 고객 화면에 QR 이 안 보임 | Settings 의 PromptPay ID 가 10자리 휴대폰 번호 또는 13자리인지 |
| 충전 알림이 관리자에게 안 옴 | 3번 Webhook 의 `x-notify-secret` 값, line-notify 재배포 여부 |
| 만료 예정 알림이 안 옴 | 2번 Vault 이름이 `notify_secret` 인지, `select * from cron.job;` 에 작업 2개가 있는지 |
| 예약 작업 실행 기록 | SQL Editor: `select * from cron.job_run_details order by start_time desc limit 10;` |
| pg_net 호출 결과 | SQL Editor: `select * from net._http_response order by created desc limit 10;` |

**Edge Function 로그:** Supabase → Edge Functions → `line-notify` → **Logs**

---

## 참고: 규칙 요약
- 가격 (VAT 7% 별도, 개당): 1개 2,200 / 10개 2,050 / 30개 1,900 / 50개 1,750 / 100개 1,500 THB
- 충전 묶음마다 승인일로부터 12개월 유효, 먼저 만료되는 묶음부터 사용
- 주문 취소 → 원래 묶음으로 복구 (원래 유효기간 그대로, 이미 만료된 묶음 몫은 복구 안 됨)
- 관리자 지급(+)은 보너스 묶음 (12개월, 현금 환불 불가), 차감(-)은 먼저 만료되는 것부터
- 현금 환불(계산만, 송금은 직접): 충전 14일 이내만. 미사용 = 전액 / 일부 사용 = 사용분을 1개 가격(+VAT)으로 다시 계산해서 뺀 나머지 / 만료·보너스·이전 잔액은 불가
- 금액은 브라우저가 아니라 DB 함수가 패키지·VAT 로 계산해요
