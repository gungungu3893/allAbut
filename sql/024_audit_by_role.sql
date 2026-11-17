-- ================================================================
-- allAbut — 024: 작업 기록(admin_audit_log)을 역할별로 나눠 보기
-- ================================================================
-- 지금(005)은 "staff 이상이면 전부 읽기" 라서 제작 직원도 영업 · 커미션 요율, 팀 변경, 설정 변경, 크레딧 · 환불 기록까지 볼 수 있었어요.
-- 이 파일은 읽기 규칙(RLS)을 기록 종류별로 바꿔요:
--   staff (제작 직원) = 주문 작업만: order_stage · order_design · order_shipping · order_deadline
--   manager          = + 충전 · 크레딧 · 고객 · 세금계산서 · 광고 · 주문 관리자 취소:
--                        topup_approved · topup_rejected · credits_added · credits_removed · order_cancelled ·
--                        tax_doc_issued · invoices_mailed · ad_banner_saved · ad_banner_deleted ·
--                        settings_changed 중 고객 일(등록 치과 정보 변경 요청 'clinic_change' · 가입 이벤트 거절 'customer')
--   owner            = 전부 (영업 · 커미션 · 팀 · 직원 · 설정 · 서비스 상태 · 파일 보관 · 현금 환불 · LINE 그룹 …)
--   sales (영업)      = 못 봐요 (has_admin_role('staff') 가 false — 015)
--   여기 목록에 없는 새 기록 종류는 자동으로 owner 만 (안전한 쪽이 기본값)
-- 브라우저는 지금처럼 admin_audit_log 를 select 해요 (RLS 가 걸러 줘요). 쓰기는 여전히 함수 · 트리거만.
--
-- 실행 순서: 023 다음. 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.
-- ⚠️ 005 를 다시 실행하면 024 도 다시 (005 가 "audit: team read" 규칙을 다시 만들어서 → 제작 직원이 다시 전부 봐요)

-- 기록 한 줄을 보려면 필요한 최소 역할
create or replace function public._audit_min_role(p_action text, p_target_type text)
returns text
language sql immutable set search_path = public as $$
  select case
    when p_action in ('order_stage', 'order_design', 'order_shipping', 'order_deadline') then 'staff'
    when p_action in ('topup_approved', 'topup_rejected', 'credits_added', 'credits_removed', 'order_cancelled',
                      'tax_doc_issued', 'invoices_mailed', 'ad_banner_saved', 'ad_banner_deleted') then 'manager'
    when p_action = 'settings_changed' and coalesce(p_target_type, '') in ('clinic_change', 'customer') then 'manager'
    else 'owner'
  end;
$$;

-- 지금 사람이 이 기록을 볼 수 있는지 (RLS 에서 써요)
create or replace function public.can_read_audit(p_action text, p_target_type text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_admin_role(public._audit_min_role(p_action, p_target_type));
$$;

revoke all on function public._audit_min_role(text, text) from public, anon;
revoke all on function public.can_read_audit(text, text) from public, anon;
grant execute on function public._audit_min_role(text, text) to authenticated;
grant execute on function public.can_read_audit(text, text) to authenticated;

-- 읽기 규칙 바꾸기 (005 의 "audit: team read" → 역할별)
alter table public.admin_audit_log enable row level security;
drop policy if exists "audit: team read" on public.admin_audit_log;
drop policy if exists "audit: read by role" on public.admin_audit_log;
create policy "audit: read by role" on public.admin_audit_log
  for select to authenticated using (public.can_read_audit(action, target_type));
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

-- 다른 읽기 규칙이 남아 있으면 알려 줘요 (규칙이 여러 개면 하나만 맞아도 보여서 — 위 규칙이 무력해져요)
do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'admin_audit_log' and cmd in ('SELECT', 'ALL')
              and policyname <> 'audit: read by role'
  loop
    raise notice '⚠️ admin_audit_log 에 다른 읽기 규칙 "%" 이 있어요 — 지우지 않으면 역할 제한이 안 먹어요', r.policyname;
  end loop;
end $$;
