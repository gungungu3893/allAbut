# 법적 페이지 · 동의 · 계정 삭제 설정 안내 (초보자용)

이번에 추가된 것
- 로그인 없이 볼 수 있는 문서 3개: **이용약관**(`#/terms`), **개인정보처리방침**(`#/privacy`, 태국 PDPA), **크레딧 및 환불 정책**(`#/credit-policy`)
  - 영어가 기준(우선), 태국어·한국어 번역본. 나머지 6개 언어는 영어 본문 + "영어로만 제공" 안내
  - 회사 정보·가격은 DB 에서 자동으로 들어가요 (비어 있으면 `[Company name]` 같은 주황 자리표시)
- 모든 화면 아래 푸터 링크, 회원가입 동의 체크, 약관이 바뀌면 전체 화면 재동의 창
- 충전 결제 화면 "크레딧 및 환불 정책을 읽었습니다" 체크
- 주문 Step 1·4 에 "환자 실명을 넣지 마세요" 안내
- Profile 의 **Delete my account** (삭제 요청) → 관리자 Customers 탭에서 처리

> ⚠️ 문서는 **초안**이에요. 관리자로 로그인해서 문서를 열면 맨 위에 "초안 · 법률 검토 필요" 표시가 보여요 (고객에게는 안 보여요).
> 실제 운영 전에 태국 변호사 검토를 꼭 받아 주세요 (아래 체크리스트).

---

## 1. SQL 실행

1. Supabase → **SQL Editor** → **New query**
2. 저장소의 `sql/003_legal.sql` 을 통째로 붙여넣기 → **Run** → `Success`
   - `002_credit_topups.sql` 을 먼저 실행한 상태여야 해요.
   - 두 번 실행해도 괜찮아요.
3. 확인 (선택):
```sql
select doc, version, effective_date from legal_versions order by doc;   -- terms, privacy, credit (오늘 날짜)
```

> SQL 을 실행하면 **기존 고객 모두** 다음 로그인 때 "Please review and agree" 창이 떠요 (아직 동의 기록이 없어서). 정상이에요.

---

## 2. 회사 정보 입력 (관리자 화면)

1. 관리자로 로그인 → **Admin → Settings**
2. 맨 위 **Company info**
   - Company: 법인명 (예: allAbut Co., Ltd.)
   - Address: 사업장 주소
   - Tax ID: 사업자등록번호 13자리
   - Email: 대표 연락 이메일
   - Privacy contact (email): 개인정보 담당 이메일 (PDPA 요청 접수용, 비우면 대표 이메일 사용)
   - Phone, LINE ID (@925caqxb)
3. **Save** → 푸터의 © 2026 회사명, 문서의 연락처·회사명이 바로 바뀌어요.

### 문서를 고친 뒤 (나중에)
문서 내용은 저장소의 `legal/` 폴더 파일이에요 (`terms.en.js`, `terms.th.js`, `terms.ko.js` …).
내용을 고쳐서 배포한 뒤 **Admin → Settings → Legal versions** 에서 **Register new version** 을 누르세요.
- 이용약관·개인정보처리방침: 새 버전을 등록하면 **모든 사용자**가 다음 접속 때 다시 동의해야 해요.
- 크레딧 정책: 버전·시행일 표시만 바뀌어요 (충전할 때 체크로 확인).

---

## 3. Database Webhook 추가 (계정 삭제 요청 → 관리자 LINE)

Supabase → **Database → Webhooks** → **Create a new hook**

| 칸 | 값 |
|---|---|
| Name | `line_notify_deletions` |
| Table | `account_deletion_requests` |
| Events | ✅ **Insert** 만 |
| Type of webhook | **Supabase Edge Functions** |
| Edge Function | `line-notify` |
| Method | `POST` |
| HTTP Headers | `x-notify-secret` = `NOTIFY_SECRET` 과 같은 값 |

→ **Create webhook**

---

## 4. line-notify 다시 배포

Supabase → **Edge Functions** → `line-notify` → 코드를 전부 지우고 `supabase/functions/line-notify/index.ts` 를 통째로 붙여넣기 → **Deploy** (Verify JWT 는 계속 OFF)

새 알림: 🗑 계정 삭제 요청 (고객, 진행 중 주문 수, 남은 크레딧, 사유) → 관리자

---

## 5. 테스트 순서

1. 로그아웃 상태에서 랜딩 화면 아래 **Terms of Service** 클릭 → 문서가 보이는지, 오른쪽 위 언어를 한국어·태국어·베트남어로 바꿔 보기
2. **Credit & Refund Policy** → 가격표와 환불 계산 예시가 실제 패키지 가격으로 나오는지
3. 새 계정 가입 → 동의 체크 없이 Create 누르면 안내, 체크하면 가입 → 동의 창 없이 바로 홈
4. 기존 고객으로 로그인 → **Please review and agree** 창 → **I agree** → 사라짐
5. Top up → 슬립 올리고 정책 체크 없이 제출 → 안내, 체크 후 제출
6. Profile → **Delete my account** → 사유 입력 → 접수 안내 (진행 중 주문·크레딧 수 표시) → 관리자 LINE 🗑 알림
7. 관리자 → **Admin → Customers** 맨 위 **Account deletion requests** → 처리
8. 관리자 → Settings → Legal versions → Terms 새 버전 등록 → 고객 다시 로그인하면 "Our terms have been updated" 창

### 계정 삭제를 실제로 할 때 (관리자, 수동)
1. 진행 중 주문 마무리, 남은 크레딧 환불 여부 결정 (Customers → Refund calculator)
2. 세무 기록(계산서·결제 기록)은 법정 기간 보관
3. Supabase → **Authentication → Users** → 그 사용자 → **Delete user**
   (주문·크레딧 기록은 profiles 에 연결돼 있어서 profiles 행이 지워지면 함께 지워져요. profiles 가 사용자 삭제 때 같이 지워지는지는
    profiles 테이블 설정에 따라 달라요 — 세무 보관이 필요한 자료는 **먼저 따로 내보내 보관**하세요)
4. Admin → Customers → 삭제 요청 → **Mark as done**

---

## 6. 변호사 검토 시 확인할 항목 (체크리스트)

- [ ] **PDPA 역할 구분:** 치과 = 개인정보 처리자(Controller), allAbut = 수탁자(Processor) — 약관·개인정보처리방침의 Processor 조항이 충분한지, 별도 **데이터 처리 계약(DPA)** 이 필요한지
- [ ] **환자 민감정보:** 구강 스캔·사진 = 건강 관련 민감정보(PDPA 26조) — 치과가 환자 명시적 동의를 받았다는 보증 문구가 충분한지, 가명 ID 요구가 적절한지
- [ ] **국외 이전:** Supabase(싱가포르), LINE(일본 등) — PDPA 28·29조 요건 (적정성·적절한 보호조치) 충족 방법과 고지 문구
- [ ] **보관 기간:** 주문·스캔 2년, 세무 서류 5년(태국 세법·회계법) — 의료기록 관련 다른 보관 의무가 있는지
- [ ] **개인정보 침해 통지:** 72시간 PDPC 통지, 치과(Controller)에 통지하는 절차
- [ ] **정보주체 권리 응답 기한(30일)** 과 접수 창구(DPO 이메일) — DPO 지정 의무 해당 여부
- [ ] **책임 제한:** "해당 주문에 사용된 크레딧 금액 한도", 간접손해 면책이 태국 민상법·불공정계약조항법(B.E. 2540)상 유효한지, B2B 전용 문구가 충분한지
- [ ] **임상 책임:** 최종 임상 판단·시술 책임이 치과의사에게 있다는 조항
- [ ] **환불 정책:** 14일 규정, 일부 사용 시 1개 가격(+VAT) 재계산, 만료·보너스 환불 불가 — 소비자보호 규정 적용 여부 (B2B), 선불 크레딧 만료(12개월)의 적법성
- [ ] **VAT · Credit Note:** 충전 시 세금계산서 발행 시점, 환불 시 감액 세금계산서(Credit Note) 발행 요건, VAT 포함 금액 기준 환불 계산
- [ ] **의료기기 규정:** 커스텀 어버트먼트가 태국 FDA 의료기기법(B.E. 2551, 2562 개정)상 등록·허가·표시 대상인지, 제조·수입 신고, 맞춤형 의료기기 기록 보관 의무
- [ ] **준거법·관할:** 태국법, 방콕 법원 (중재 조항 필요 여부)
- [ ] **약관 변경 시 재동의** 방식과 시행일 고지 기간
- [ ] **번역본:** 영어 우선 조항, 태국어 번역본의 정확성 (태국 법원 제출 시 태국어본 필요 여부)
