# LINE 알림 배포 안내 (초보자용)

allAbut 의 LINE 알림은 **Supabase Edge Function 2개**로 동작해요.

| 함수 | 하는 일 | 누가 부르나 |
|---|---|---|
| `line-webhook` | 고객이 LINE 에 보낸 **연결 코드(AB-XXXX)** 를 받아서 계정과 LINE 을 연결 | LINE |
| `line-notify` | 주문 단계가 바뀌거나 크레딧이 충전되면 **LINE 알림** 보내기 | Supabase Database Webhook |

코드는 저장소의 이 두 파일이에요.
- `supabase/functions/line-webhook/index.ts`
- `supabase/functions/line-notify/index.ts`

> 🔒 **비밀값(토큰·시크릿)은 코드에 없어요.** 함수는 Supabase 에 저장된 Secrets 를 `Deno.env.get()` 으로 읽어요.
> 이미 저장해 두신 값: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_ADMIN_USER_ID`, `NOTIFY_SECRET`
> (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 자동으로 넣어 줘요. 브라우저 코드에는 절대 넣지 마세요.)

---

## 0. 준비물 확인

1. Supabase 대시보드 → 왼쪽 메뉴 **Edge Functions** → 위쪽 **Secrets** (또는 **Manage secrets**)
2. 아래 4개가 보이면 OK 예요.
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `LINE_ADMIN_USER_ID` (관리자 본인의 LINE 사용자 id, `U` 로 시작하는 33글자)
   - `NOTIFY_SECRET` (아무도 모르는 긴 글자 — 3장에서 한 번 더 써요. 메모장에 잠깐 복사해 두세요)

---

## 1. Edge Function 2개 만들기

### 1-1. `line-webhook`
1. Supabase 대시보드 → **Edge Functions**
2. 오른쪽 위 **Deploy a new function** → **Via Editor** 를 눌러요.
3. 함수 이름 칸에 `line-webhook` 이라고 정확히 입력해요.
4. 에디터에 원래 들어 있는 예시 코드를 **전부 지우고**, 저장소의 `supabase/functions/line-webhook/index.ts` 내용을 **통째로** 붙여넣어요.
5. 아래쪽 **Deploy function** (또는 **Deploy**) 를 눌러요. 1~2분 기다리면 완료돼요.
6. **Verify JWT 끄기 (꼭!)**
   - 함수 목록에서 `line-webhook` 을 눌러 들어가요 → 위쪽 탭 **Details** (또는 **Settings**)
   - **Enforce JWT Verification** (Verify JWT) 스위치를 **끄고(OFF)** → **Save** 를 눌러요.
   - 이유: LINE 은 Supabase 로그인 토큰이 없어요. 대신 함수가 LINE 서명(x-line-signature)을 직접 확인해요.

### 1-2. `line-notify`
1. 다시 **Deploy a new function** → **Via Editor**
2. 함수 이름: `line-notify`
3. 예시 코드를 지우고 `supabase/functions/line-notify/index.ts` 내용을 통째로 붙여넣기 → **Deploy**
4. **Verify JWT 끄기** — 위와 같은 위치에서 OFF → **Save**
   - 이유: Database Webhook 이 부를 거예요. 대신 함수가 헤더 `x-notify-secret` 이 `NOTIFY_SECRET` 과 같은지 확인해요 (다르면 401).

---

## 2. 함수 주소 확인

각 함수 화면 위쪽(**Details**)에 주소(Endpoint URL)가 보여요.

- `line-webhook`: `https://jtqsbzihnduktffymncm.supabase.co/functions/v1/line-webhook`
- `line-notify`: `https://jtqsbzihnduktffymncm.supabase.co/functions/v1/line-notify`

---

## 3. LINE Developers Console 에 Webhook 연결

1. https://developers.line.biz/console/ 에 로그인
2. Provider → **allAbut** 채널(Messaging API) 선택 → 위쪽 탭 **Messaging API**
3. **Webhook settings** → **Webhook URL** 옆 **Edit**
4. `https://jtqsbzihnduktffymncm.supabase.co/functions/v1/line-webhook` 붙여넣기 → **Update**
5. **Verify** 버튼 → **Success** 가 나오면 성공이에요.
   - 실패하면: 1-1 의 6번(Verify JWT 끄기)을 다시 확인하세요.
6. 바로 아래 **Use webhook** 스위치를 **켜요(ON)**.
7. (권장) 같은 화면 아래 **LINE Official Account features** → **Auto-reply messages** 의 **Edit** →
   LINE Official Account Manager 에서 **자동 응답(Auto-response) 끄기**, **Webhook 켜기**
   - 자동 응답이 켜져 있으면 고객이 코드를 보낼 때 기본 자동 답장이 같이 가요.

---

## 4. Supabase Database Webhook 2개 만들기

Supabase 대시보드 → **Database** → **Webhooks** (또는 **Integrations → Database Webhooks**) → **Create a new hook**

### 4-1. 주문 알림 (`cnc_orders`)
| 칸 | 값 |
|---|---|
| Name | `line_notify_orders` |
| Table | `cnc_orders` |
| Events | ✅ **Insert**, ✅ **Update** (Delete 는 끄기) |
| Type of webhook | **Supabase Edge Functions** |
| Edge Function | `line-notify` |
| Method | `POST` |
| Timeout | `5000` (기본값 그대로 OK) |
| HTTP Headers | **Add a new header** → 이름 `x-notify-secret`, 값은 Secrets 에 저장한 `NOTIFY_SECRET` 과 **똑같은 글자** |

(`Content-type: application/json` 헤더는 자동으로 들어가 있어요. Authorization 헤더가 자동으로 추가돼 있으면 그대로 둬도 괜찮아요.)

→ **Create webhook**

### 4-2. 크레딧 충전 알림 (`credit_history`)
위와 똑같이 만들고, 다른 점만:
| 칸 | 값 |
|---|---|
| Name | `line_notify_credits` |
| Table | `credit_history` |
| Events | ✅ **Insert** 만 |

---

## 5. 테스트 순서

### 5-1. 고객 연결 테스트
1. 웹사이트에 고객 계정으로 로그인 → **Profile** → 아래쪽 **LINE notifications**
2. **Add friend on LINE** (PC 는 QR 코드를 휴대폰으로 찍기) → allAbut 친구추가
   - 친구추가하면 "연결 코드를 보내 주세요" 안내 메시지가 와요 (영어·태국어·한국어).
3. 화면의 연결 코드(예: `AB-7K2Q`)를 LINE 채팅에 보내요.
4. "✅ 연결되었어요" 답장이 오면 성공 → 웹에서 **I've sent it — check status** → **Connected to LINE** 표시

### 5-2. 알림 테스트
1. 고객 계정으로 새 주문 제출 → **관리자 LINE** 에 🆕 New order 카드
2. 관리자 화면에서 **Confirm order** → **고객 LINE** 에 "주문이 확인되었어요"
3. **Upload design** → 고객 LINE 에 "디자인을 확인해 주세요"
4. 고객이 **디자인 승인** → 관리자 LINE 에 ✅ / **수정 요청** → ✏️ + 사유
5. **Start milling** → 고객 LINE 에 "가공을 시작했어요 (이제 취소할 수 없어요)"
6. **Ship** → 고객 LINE 에 택배사·송장번호
7. 고객 **수령 확인** → 관리자 LINE 에 📦
8. Customers 탭에서 **+10** 크레딧 → 고객 LINE 에 💳

---

## 6. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| LINE Verify 가 실패 | `line-webhook` 의 Verify JWT 가 OFF 인지, URL 끝이 `/line-webhook` 인지 |
| 코드를 보내도 답장이 없음 | LINE Developers 의 **Use webhook** 이 ON 인지, Official Account Manager 의 Webhook 이 ON 인지 |
| "코드를 찾을 수 없어요" | 웹 Profile 에 보이는 코드와 같은지 (대소문자·공백은 상관없어요) |
| 알림이 안 와요 | Database Webhook 헤더 `x-notify-secret` 값이 Secrets 의 `NOTIFY_SECRET` 과 똑같은지 / 고객이 LINE 연결을 했는지 |
| 관리자 알림만 안 와요 | Secrets 의 `LINE_ADMIN_USER_ID` 가 `U` 로 시작하는 33글자인지 (관리자도 allAbut 을 친구추가해야 받을 수 있어요) |

**로그 보는 곳:** Supabase → **Edge Functions** → 함수 이름 클릭 → 위쪽 탭 **Logs** (또는 **Invocations**)
- `invalid signature` (401): LINE_CHANNEL_SECRET 이 틀렸거나 LINE 이 아닌 곳에서 온 요청
- `unauthorized` (401): Database Webhook 의 `x-notify-secret` 헤더가 틀림
- `LINE push failed 400/401/403`: 토큰(LINE_CHANNEL_ACCESS_TOKEN)이 틀렸거나, 받는 사람이 친구를 차단함

**Database Webhook 기록:** Supabase → Database → Webhooks → 해당 hook → 최근 호출 결과(상태 코드)도 볼 수 있어요.

---

## 참고: 알림 규칙 요약
- 같은 단계로 다시 저장되는 경우(단계가 안 바뀜)는 알림을 보내지 않아요.
- LINE 전송이 실패해도 주문 저장은 그대로 돼요 (함수는 항상 200).
- 관리자가 **Mark as delivered** 를 직접 누른 경우에는 관리자에게 "고객 수령" 알림을 보내지 않아요.
- 관리자 취소(Cancel & refund)는 주문 이력에 `admin_cancelled` 가 먼저 기록되고, 그 기록으로 "고객 취소"와 구분해요.
