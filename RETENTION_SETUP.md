# 주문 파일 2년 보관 후 자동 삭제 — 설정 안내 (sql/020_order_file_retention.sql)

개인정보처리방침에 적은 "주문 파일은 완료 · 취소 후 2년이 지나면 삭제" 를 실제로 하는 기능이에요.
이 파일은 사이트에 올라가지 않아요 (`*.md` 는 배포 제외).

## 무엇이 지워지나요
- 대상: **완료(done) 또는 취소(cancelled)된 지 보관 기간(기본 24개월)이 지난 주문**
- 지우는 것
  - Storage 파일: 스캔 · 사진 · PDF (`cnc-files` 버킷) + 디자인 파일 (`cnc-designs` 버킷)
  - 주문 안의 글자: 환자 ID → `deleted`, 메모 → 빈 값, 파일 이름 · 파일 경로 → 빈 목록, 단계 기록의 메모(note) → 빈 값
- 남기는 것 (세금 · 회계 보관): 주문번호 · 날짜 · 단계 · 치아(번호 · 제품 · 브랜드 · 사이즈 · 쉐이드) · 치아 수 · 크레딧 사용 · 치과 · 배송 정보
- 입금 슬립(`topup-slips`)은 **지우지 않아요** (결제 기록 — 세금 · 회계 보관 기간)
- 고객 화면: "🗂 보관 기간이 지나 파일이 삭제됐어요" (오류처럼 보이지 않게), 관리자 주문 상세: 지운 파일 수

## 안전장치
- **처음에는 "미리보기" 모드**: 지울 주문 목록만 기록하고 아무것도 지우지 않아요.
  관리자 Settings → **🗂 주문 파일 보관 기간** 에서 owner 가 **실제 삭제** 로 바꿔야 지워요 (확인 창이 한 번 더 나와요).
- 한 번에 처리하는 주문 수 제한 (기본 50건) — 남은 것은 다음 날 밤
- 파일 삭제에 실패한 주문은 오류로 기록만 하고 다음 날 다시 시도
- 기록: `retention_runs` (실행마다 1줄) · `retention_log` (주문마다: 주문번호 · 찾은/지운 파일 수 · 시각 · 상태) — 관리자 카드에서 볼 수 있어요

---

## 1. SQL 실행
1. Supabase 대시보드 → **SQL Editor** → **New query**
2. 저장소의 `sql/020_order_file_retention.sql` 내용을 통째로 붙여넣고 **Run**
3. 두 번 실행해도 안전해요. 다시 실행해도 모드(미리보기 / 실제 삭제)는 바뀌지 않아요.

확인:
```sql
select * from data_retention_settings;                                   -- months 24 · mode preview
select jobname, schedule from cron.job where jobname = 'allabut-data-retention';   -- 15 19 * * * (방콕 02:15)
```

## 2. Vault 비밀값 확인 (`notify_secret`)
만료 알림 때문에 이미 넣어 두었을 거예요 (`TOPUP_SETUP.md` 2장). **같은 값을 다시 써요** — 새로 만들 필요 없어요.
```sql
select name from vault.decrypted_secrets where name = 'notify_secret';   -- 1줄이 나오면 OK
```
없으면: Supabase → **Project Settings → Vault** → **Add new secret** → Name `notify_secret`, Value = Edge Function 비밀값 `NOTIFY_SECRET` 과 **똑같은 값**.

## 3. Edge Function `data-retention` 배포
1. Supabase 대시보드 → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. 함수 이름: `data-retention` (정확히)
3. 예시 코드를 **전부 지우고** 저장소의 `supabase/functions/data-retention/index.ts` 내용을 **통째로** 붙여넣기 → **Deploy**
4. **Verify JWT 끄기 (꼭!)** — 함수를 눌러 들어가 **Details**(또는 Settings) → **Enforce JWT Verification** 을 **OFF** → **Save**
   - 이유: pg_cron(pg_net)이 부를 때는 로그인 토큰이 없어요. 대신 함수가 헤더 `x-notify-secret` 이 `NOTIFY_SECRET` 과 같은지 확인해요 (다르면 401)
5. 비밀값: **Edge Functions → Secrets** 에 `NOTIFY_SECRET` 이 이미 있으면 그대로 (LINE 알림과 같은 값, 프로젝트 전체 공용).
   `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 자동으로 넣어 줘요 — **직접 넣지 마세요**

CLI 를 쓰면:
```bash
supabase functions deploy data-retention --no-verify-jwt
```

## 4. 미리보기로 시험
1. 사이트 → 관리자 → **Settings** → 맨 아래 **🗂 주문 파일 보관 기간** (owner 만 보여요)
2. **▶ 지금 실행** → 1~2분 뒤 **↻ 새로고침**
3. "최근 실행" 에 줄이 생기고, 지울 주문이 있으면 "지워질 주문 (최근 미리보기)" 목록이 보여요 (아직 2년이 안 지났으면 0건이 정상)

안 되면:
```sql
select * from retention_runs order by started_at desc limit 5;           -- 실행 기록
select id, status_code, content from net._http_response order by created desc limit 5;   -- 함수 응답 (401 = 비밀값이 다름)
```
| 증상 | 확인할 것 |
|---|---|
| "지금 실행" 에 "notify_secret 이 없어요" | 2장 Vault 이름이 정확히 `notify_secret` 인지 |
| `net._http_response` 가 401 | Vault 값과 Edge Function 비밀값 `NOTIFY_SECRET` 이 같은지 |
| 404 | 함수 이름이 `data-retention` 인지 |
| 실행 기록이 안 생김 | 3장 4번 Verify JWT 가 OFF 인지 |

## 5. 실제 삭제로 바꾸기 (준비가 되면)
- 관리자 카드에서 **실제 삭제** 를 고르고 **저장** → 확인 창에서 **실제 삭제로 바꾸기**
- 그다음 밤(방콕 02:15)부터 하루 최대 50건씩 지워요. **지운 파일은 되살릴 수 없어요**
- 보관 기간을 24개월이 아닌 값으로 바꾸면 카드에 주황 안내가 나와요 → **개인정보처리방침(영 · 태 · 한) 문장도 같이 고치고 새 버전 등록**

## 멈추고 싶을 때
- 관리자 카드에서 **미리보기** 로 바꾸면 바로 지우기를 멈춰요 (목록만 계속 기록)
- 예약 작업 자체를 끄려면:
```sql
select cron.unschedule(jobid) from cron.job where jobname = 'allabut-data-retention';
```
  (다시 켜려면 `sql/020_order_file_retention.sql` 을 다시 실행)

## 참고
- 함수 주소는 020 안의 `run_data_retention()` 에 적혀 있어요 (`https://jtqsbzihnduktffymncm.supabase.co/functions/v1/data-retention` — 만료 알림과 같은 프로젝트 주소). Supabase 프로젝트를 바꾸면 이 주소도 바꿔요
- `sql/launch_reset.sql` 은 `retention_runs` · `retention_log` 도 비워요 (보관 설정 `data_retention_settings` 는 남김)
