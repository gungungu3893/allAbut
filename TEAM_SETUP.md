# 팀(직원) 권한 · 작업 기록 · 관리자 LINE 그룹 설정 안내 (초보자용)

이번에 추가된 것
- **역할 3가지**: Owner(대표) / Manager(매니저) / Staff(직원) — 직원마다 볼 수 있는 화면과 할 수 있는 일이 달라요
- **Team 탭**: 직원 추가·역할 변경·이름 변경·제거 (Owner만)
- **Activity 탭**: 누가 언제 무엇을 했는지 작업 기록 (직원 모두 볼 수 있어요)
- **관리자 알림을 LINE 그룹으로**: 새 주문·충전 요청·계정 삭제 요청 알림이 팀 LINE 그룹으로 가요.
  직원이 처리한 일도 그룹에 "Confirmed by Ken" 처럼 짧게 알려줘요

| 역할 | 할 수 있는 일 |
|---|---|
| **Staff** | Orders(주문 확인·디자인 업로드·가공 시작·발송·완료), Activity 보기 |
| **Manager** | Staff + Top-ups(충전 승인/거절), Customers(고객·크레딧 지급/차감·계정 삭제 요청), 주문 취소·환불, Dashboard 주문 통계 |
| **Owner** | 전부 + 현금 환불, 매출(Revenue), Settings(가격·결제·회사 정보·법적 버전·LINE 그룹), Team |

> 화면에서 버튼을 숨기는 것은 편의일 뿐이고, 실제 보호는 데이터베이스 규칙이 해요. 주소를 직접 입력해도 권한이 없으면 막혀요.

---

## 1. SQL 실행

1. Supabase → **SQL Editor** → **New query**
2. 저장소의 `sql/005_team.sql` 을 통째로 붙여넣기 → **Run** → `Success`
   - `002`, `003`, `004` 를 먼저 실행한 상태여야 해요. 두 번 실행해도 괜찮아요.
   - 지금 관리자(사장님)는 자동으로 **Owner** 가 돼요.
   - ⚠️ 나중에 `002` / `003` / `004` 중 하나를 다시 실행했다면 **005 도 다시 실행**하세요 (관리자 함수가 "관리자면 누구나" 로 돌아가요).
3. 확인 (선택):
```sql
select user_id, role, display_name from admins;   -- 내 줄의 role 이 owner
```

---

## 2. LINE 공식계정: 그룹 참여 허용

LINE 공식계정은 기본으로 그룹에 들어가지 못하게 되어 있어요.

1. **LINE Official Account Manager** (https://manager.line.biz) 에 로그인 → allAbut 계정 선택
2. 오른쪽 위 **설정(Settings)** → **계정 설정(Account settings)**
3. **기능 전환(Feature toggles)** 의 **그룹·여러 명 채팅 참여(Allow account to join groups and multi-person chats)** → **허용(Allow)**

> 메뉴 이름은 LINE 이 가끔 바꿔요. "그룹" 또는 "groups" 가 들어간 항목을 찾으세요.

---

## 3. line-webhook · line-notify 다시 배포

둘 다 코드가 바뀌었어요.

1. Supabase → **Edge Functions** → `line-webhook` → 코드를 전부 지우고 `supabase/functions/line-webhook/index.ts` 를 통째로 붙여넣기 → **Deploy** (Verify JWT 는 계속 OFF)
2. `line-notify` 도 똑같이 `supabase/functions/line-notify/index.ts` 로 → **Deploy** (Verify JWT OFF)

새 Secrets 는 필요 없어요. `LINE_ADMIN_USER_ID` 는 그대로 두세요 — LINE 그룹이 하나도 없을 때 알림을 받는 안전장치예요.

---

## 4. 관리자 LINE 그룹 연결

1. allAbut 에 Owner 로 로그인 → **Admin → Settings** → 맨 위 **LINE groups** → **Create group code**
2. 화면에 큰 코드(예: `GRP-7K2Q`)와 남은 시간(30분)이 보여요
3. 휴대폰 LINE 에서
   - ① 팀원들과 **그룹 만들기** (이미 있는 그룹도 돼요)
   - ② 그룹에 **allAbut 공식계정(@925caqxb) 초대** → 그룹에 안내 메시지가 와요
   - ③ 그룹 채팅에 **코드를 그대로 보내기** (예: `GRP-7K2Q`)
4. 그룹에 "✅ 이 그룹에서 allAbut 관리자 알림을 받아요" 답장이 오고, 컴퓨터 화면도 몇 초 안에 저절로 "연결됨" 으로 바뀌어요
5. 그룹마다 받을 알림을 고를 수 있어요: **Orders**(주문) / **Top-ups & refunds**(충전·환불) / **Account deletion requests**(계정 삭제 요청) / **Customer notice copies**(고객 알림 사본 — 고객에게 간 LINE 알림의 사본, 고객 LINE 미연결이면 "❌ … contact directly" + 전화번호), **On** 으로 켜기/끄기, **Remove group** 으로 삭제
   - 고객 알림 사본은 `sql/006_customer_copy.sql` 을 실행하면 지금 켜져 있는 그룹과 새 그룹에 자동으로 켜져요

- 그룹이 하나라도 연결돼 켜져 있으면 관리자 알림은 **그룹으로만** 가요 (LINE_ADMIN_USER_ID 로는 안 가요).
- 공식계정을 그룹에서 내보내면 그 그룹 알림은 자동으로 꺼져요. 다시 연결하려면 새 코드를 만들어 보내세요.
- 코드는 30분 동안 한 번만 쓸 수 있어요.

---

## 5. 직원 추가

1. 직원이 먼저 **allabut.com 에서 회원가입** (일반 고객처럼, 이메일 인증까지)
2. Owner → **Admin → Team** → **Add a team member**
   - Email: 직원이 가입한 이메일
   - Name: 팀에서 보일 이름 (작업 기록·LINE 그룹 알림에 "Confirmed by Ken" 처럼 나와요)
   - Role: Staff / Manager / Owner
3. **Add member** → 직원이 **로그아웃 후 다시 로그인**하면 Admin 메뉴가 보여요 (헤더에 "Admin · Staff" 처럼 역할 표시)

- 역할 변경: 목록의 역할 칸을 바꾸면 확인창 → 적용 (직원은 다시 로그인하면 바뀐 화면)
- 제거: **Remove** → 확인창. 그 사람은 일반 고객 계정으로 남아요
- Owner 는 최소 1명 있어야 해요 (마지막 Owner 는 강등·제거 불가). 자기 자신은 제거할 수 없어요

---

## 6. 테스트 순서

1. SQL 실행 → 사장님 계정으로 로그인 → 헤더에 **Admin · Owner**, 탭 7개 (Orders · Top-ups · Customers · Dashboard · Activity · Team · Settings)
2. 테스트용 계정을 하나 더 가입 → Team 에서 **Staff** 로 추가
3. 그 계정으로 로그인 → 탭이 **Orders · Activity** 만 보이는지, 주소창에 `#/admin/settings` 를 쳐도 Orders 로 돌아오는지
4. Staff 로 주문 하나를 **Confirm** → 주문 상세 이력에 직원 이름, **Activity** 에 "Order status changed · 이름"
5. Owner 로 그 계정을 **Manager** 로 바꾸고 다시 로그인 → Top-ups · Customers · Dashboard(주문 통계만) 가 보이는지, 고객 상세의 환불 계산기는 잠겨 있는지
6. LINE 그룹 연결(4장) → 고객 계정으로 새 주문 → 그룹에 🆕 New order 알림
7. Staff 가 주문 Confirm → 그룹에 "✔ Confirmed by 이름"
8. Settings → LINE groups 에서 그 그룹의 **Orders** 체크를 끄고 새 주문 → 그룹에 안 오는지
9. 공식계정을 그룹에서 내보내기 → Settings 에서 그 그룹이 꺼짐(회색)으로 보이는지
