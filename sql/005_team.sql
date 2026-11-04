-- ================================================================
-- allAbut 005 — 팀(직원) 관리자 권한 · 작업 기록 · 관리자 LINE 그룹 알림
-- ================================================================
-- 실행: Supabase → SQL Editor → 이 파일 전체 붙여넣고 Run
--   - 002, 003, 004 를 먼저 실행한 상태여야 해요. 두 번 실행해도 안전해요.
--   - ⚠️ 나중에 002 / 003 / 004 중 하나를 다시 실행했다면 이 파일도 다시 실행하세요
--     (그 파일들이 관리자 함수를 예전처럼 "관리자면 누구나" 로 되돌려요)
--
-- 역할 (위가 아래를 모두 포함):  owner ⊃ manager ⊃ staff
--   staff   : 주문 보기·단계 변경·디자인 업로드·배송 입력, 작업 기록 보기
--   manager : + 충전 승인/거절, 크레딧 지급/차감, 주문 관리자 취소, 고객 목록·프로필, 계정 삭제 요청 처리
--   owner   : + 현금 환불, 가격·결제·회사 정보·법적 버전 수정, 매출 통계, 팀 관리, LINE 그룹
--
-- 이 파일이 하는 일
--   1) admins 에 role / display_name / added_by / created_at, 기존 관리자 → owner (owner 가 아무도 없을 때만)
--   2) admin_role(), has_admin_role(p_min)  — is_admin() 은 "역할이 있으면 true" 그대로
--   3) 읽기·쓰기 규칙(RLS)과 Storage 규칙을 역할 기준으로
--   4) 기존 관리자 함수 안의 is_admin() 체크를 역할 체크로 바꿔 끼우기 (함수 내용은 그대로)
--   5) 작업 기록 admin_audit_log + 기록 트리거, review_history 의 by:'admin' 에 실제 처리자 이름(by_name) 붙이기
--   6) 팀 관리 함수 (owner)
--   7) 관리자 LINE 알림 대상(admin_notify_targets) + 그룹 연결 코드(admin_group_link_codes)


-- ================================================================
-- 1) admins: 역할 · 이름 · 추가한 사람
-- ================================================================
alter table public.admins add column if not exists role text not null default 'staff';
alter table public.admins add column if not exists display_name text not null default '';
alter table public.admins add column if not exists added_by uuid;
alter table public.admins add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admins_role_check' and conrelid = 'public.admins'::regclass) then
    alter table public.admins add constraint admins_role_check check (role in ('owner', 'manager', 'staff'));
  end if;
end $$;

-- 처음 실행할 때: owner 가 한 명도 없으면 지금 있는 관리자(사장님) 모두 owner 로
update public.admins set role = 'owner'
 where not exists (select 1 from public.admins where role = 'owner');


-- ================================================================
-- 2) 역할 도구
-- ================================================================
-- 역할 순위: owner 3 > manager 2 > staff 1 (모르는 값 0)
create or replace function public._admin_role_rank(p_role text)
returns integer
language sql immutable as $$
  select case p_role when 'owner' then 3 when 'manager' then 2 when 'staff' then 1 else 0 end;
$$;

-- 지금 로그인한 사람의 역할 (팀이 아니면 null)
create or replace function public.admin_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.admins where user_id = auth.uid();
$$;

-- 이 역할 이상인지 (예: has_admin_role('manager') → manager 와 owner 는 true)
create or replace function public.has_admin_role(p_min text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public._admin_role_rank(role) from public.admins where user_id = auth.uid()), 0)
         >= greatest(public._admin_role_rank(p_min), 1);
$$;

-- is_admin(): 역할이 하나라도 있으면 true (예전 규칙과 호환)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 처리자 이름: 팀 이름 → 닉네임 → 이메일
create or replace function public._admin_name(p_user uuid)
returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    (select nullif(trim(display_name), '') from public.admins where user_id = p_user),
    (select nullif(trim(nickname), '') from public.profiles where id = p_user),
    (select email::text from auth.users where id = p_user),
    '');
$$;

-- 내 역할 + 이름 (화면용)
create or replace function public.admin_me()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when a.user_id is null then null
              else jsonb_build_object('role', a.role, 'name', public._admin_name(a.user_id)) end
    from (select auth.uid() as uid) me
    left join public.admins a on a.user_id = me.uid;
$$;


-- ================================================================
-- 3) 읽기·쓰기 규칙 (RLS) — 역할 기준
-- ================================================================
-- 주문: 고객 본인 또는 staff 이상 읽기, staff 이상 수정, owner 만 삭제
drop policy if exists "cnc_orders: read own" on public.cnc_orders;
drop policy if exists "cnc_orders: admin update" on public.cnc_orders;
drop policy if exists "cnc_orders: admin delete" on public.cnc_orders;
create policy "cnc_orders: read own" on public.cnc_orders
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('staff'));
create policy "cnc_orders: admin update" on public.cnc_orders
  for update to authenticated using (public.has_admin_role('staff')) with check (public.has_admin_role('staff'));
create policy "cnc_orders: admin delete" on public.cnc_orders
  for delete to authenticated using (public.has_admin_role('owner'));

-- 고객의 돈·크레딧 정보: 본인 또는 manager 이상
drop policy if exists "wallet: read own" on public.credit_wallets;
create policy "wallet: read own" on public.credit_wallets
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('manager'));
drop policy if exists "credit_history: read own" on public.credit_history;
create policy "credit_history: read own" on public.credit_history
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('manager'));
drop policy if exists "invoices: read own" on public.invoices;
create policy "invoices: read own" on public.invoices
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('manager'));
drop policy if exists "topup_requests: read own" on public.topup_requests;
create policy "topup_requests: read own" on public.topup_requests
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('manager'));
drop policy if exists "credit_lots: read own" on public.credit_lots;
create policy "credit_lots: read own" on public.credit_lots
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('manager'));
drop policy if exists "credit_lot_usage: read" on public.credit_lot_usage;
create policy "credit_lot_usage: read" on public.credit_lot_usage
  for select to authenticated using (
    public.has_admin_role('manager') or exists (select 1 from public.credit_lots l where l.id = lot_id and l.user_id = auth.uid())
  );
drop policy if exists "deletion: read own" on public.account_deletion_requests;
create policy "deletion: read own" on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('manager'));

-- 가격·결제·회사 정보·법적 버전: 수정은 owner 만 (읽기 규칙은 그대로)
drop policy if exists "credit_packages: admin insert" on public.credit_packages;
drop policy if exists "credit_packages: admin update" on public.credit_packages;
drop policy if exists "credit_packages: admin delete" on public.credit_packages;
create policy "credit_packages: admin insert" on public.credit_packages
  for insert to authenticated with check (public.has_admin_role('owner'));
create policy "credit_packages: admin update" on public.credit_packages
  for update to authenticated using (public.has_admin_role('owner')) with check (public.has_admin_role('owner'));
create policy "credit_packages: admin delete" on public.credit_packages
  for delete to authenticated using (public.has_admin_role('owner'));
drop policy if exists "payment_settings: admin update" on public.payment_settings;
create policy "payment_settings: admin update" on public.payment_settings
  for update to authenticated using (public.has_admin_role('owner')) with check (public.has_admin_role('owner'));
drop policy if exists "company_settings: admin update" on public.company_settings;
create policy "company_settings: admin update" on public.company_settings
  for update to authenticated using (public.has_admin_role('owner')) with check (public.has_admin_role('owner'));
drop policy if exists "legal_versions: admin insert" on public.legal_versions;
create policy "legal_versions: admin insert" on public.legal_versions
  for insert to authenticated with check (public.has_admin_role('owner'));

-- 고객 프로필: 저장소 밖에서 만든 "관리자 읽기" 규칙이 있으면 그 안의 is_admin() 을 manager 이상으로 바꿔요
-- (본인 읽기·수정 부분은 그대로 둬요)
do $$
declare
  p record;
  v_qual text;
  v_check text;
  v_sql text;
begin
  for p in
    select policyname, qual, with_check from pg_policies
     where schemaname = 'public' and tablename = 'profiles'
       and (coalesce(qual, '') ~ 'is_admin\(\)' or coalesce(with_check, '') ~ 'is_admin\(\)')
  loop
    v_qual := regexp_replace(p.qual, '(public\.)?is_admin\(\)', 'public.has_admin_role(''manager''::text)', 'g');
    v_check := regexp_replace(p.with_check, '(public\.)?is_admin\(\)', 'public.has_admin_role(''manager''::text)', 'g');
    v_sql := format('alter policy %I on public.profiles', p.policyname);
    if v_qual is not null then v_sql := v_sql || ' using (' || v_qual || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end $$;
-- manager 이상은 고객 프로필을 읽을 수 있어요 (이미 비슷한 규칙이 있어도 같이 있어도 괜찮아요)
drop policy if exists "profiles: team read" on public.profiles;
create policy "profiles: team read" on public.profiles
  for select to authenticated using (public.has_admin_role('manager'));

-- Storage: 주문 파일·디자인 파일은 staff 이상, 입금 슬립은 manager 이상
drop policy if exists "cnc-files: admin all" on storage.objects;
create policy "cnc-files: admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'cnc-files' and public.has_admin_role('staff'))
  with check (bucket_id = 'cnc-files' and public.has_admin_role('staff'));
drop policy if exists "cnc-designs: admin all" on storage.objects;
create policy "cnc-designs: admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'cnc-designs' and public.has_admin_role('staff'))
  with check (bucket_id = 'cnc-designs' and public.has_admin_role('staff'));
drop policy if exists "topup-slips: admin all" on storage.objects;
create policy "topup-slips: admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'topup-slips' and public.has_admin_role('manager'))
  with check (bucket_id = 'topup-slips' and public.has_admin_role('manager'));


-- ================================================================
-- 4) 기존 관리자 함수: 안의 "is_admin()" 체크를 역할 체크로 바꿔 끼우기
-- ================================================================
-- 함수 내용(계산·처리)은 그대로 두고, 권한 확인 한 줄만 바뀌어요.
-- 저장소에 없는 함수(예: admin_list_users)도 같은 방법으로 바뀌어요. 이미 바뀐 함수는 건너뛰어요.
do $$
declare
  r record;
  f record;
  v_def text;
begin
  for r in
    select * from (values
      ('admin_approve_topup', 'manager'),
      ('admin_reject_topup', 'manager'),
      ('admin_add_credits', 'manager'),
      ('admin_cancel_cnc_order', 'manager'),
      ('admin_list_users', 'manager'),
      ('admin_handle_deletion_request', 'manager'),
      ('admin_refund_quote', 'owner'),
      ('admin_refund_cash', 'owner'),
      ('admin_finance_month', 'owner'),
      ('admin_finance_trend', 'owner'),
      ('admin_outstanding_credits', 'owner'),
      ('admin_topups_export', 'owner')
    ) as t(fname, min_role)
  loop
    for f in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = r.fname
    loop
      v_def := pg_get_functiondef(f.oid);
      if v_def ~ 'is_admin\(\)' then
        execute regexp_replace(v_def, '(public\.)?is_admin\(\)', 'public.has_admin_role(''' || r.min_role || ''')', 'g');
      end if;
    end loop;
  end loop;
end $$;


-- ================================================================
-- 5) 작업 기록 (admin_audit_log)
-- ================================================================
create table if not exists public.admin_audit_log (
  id           bigint generated by default as identity primary key,
  actor_id     uuid,
  actor_name   text not null default '',
  action       text not null,
  target_type  text not null default '',
  target_id    text not null default '',
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_admin_audit_log_created on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_actor on public.admin_audit_log (actor_id, created_at desc);
alter table public.admin_audit_log enable row level security;
drop policy if exists "audit: team read" on public.admin_audit_log;
create policy "audit: team read" on public.admin_audit_log
  for select to authenticated using (public.has_admin_role('staff'));
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
-- 쓰기는 아래 함수·트리거만 (브라우저에서 직접 못 써요)

-- 기록 남기기: 지금 사람이 팀원일 때만 (고객이 한 일은 기록하지 않아요)
create or replace function public._audit(p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.admins where user_id = v_uid) then return; end if;
  insert into public.admin_audit_log (actor_id, actor_name, action, target_type, target_id, detail)
  values (v_uid, public._admin_name(v_uid), p_action, coalesce(p_target_type, ''), coalesce(p_target_id, ''), coalesce(p_detail, '{}'::jsonb));
end $$;

-- 주문: review_history 에 관리자가 새로 붙인 기록(by:'admin')에 실제 처리자 이름·id 를 붙여요
create or replace function public._trg_orders_by_name()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old integer;
  v_name text;
begin
  if v_uid is null or not exists (select 1 from public.admins where user_id = v_uid) then return new; end if;
  if jsonb_typeof(new.review_history) <> 'array' then return new; end if;
  v_old := case when jsonb_typeof(old.review_history) = 'array' then jsonb_array_length(old.review_history) else 0 end;
  if jsonb_array_length(new.review_history) <= v_old then return new; end if;
  v_name := public._admin_name(v_uid);
  select jsonb_agg(
           case when x.i > v_old and x.e ->> 'by' = 'admin'
                then x.e || jsonb_build_object('by_name', v_name, 'by_id', v_uid)
                else x.e end
           order by x.i)
    into new.review_history
    from jsonb_array_elements(new.review_history) with ordinality as x(e, i);
  return new;
end $$;
drop trigger if exists trg_orders_by_name on public.cnc_orders;
create trigger trg_orders_by_name before update on public.cnc_orders
  for each row execute function public._trg_orders_by_name();

-- 주문 단계 변경 · 배송 정보 입력 기록
create or replace function public._trg_orders_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_last jsonb;
begin
  if new.stage is distinct from old.stage then
    v_last := case when jsonb_typeof(new.review_history) = 'array' then new.review_history -> -1 else null end;
    perform public._audit(
      case when new.stage = 'cancelled' then 'order_cancelled' else 'order_stage' end,
      'order', new.id,
      jsonb_build_object('from', old.stage, 'to', new.stage, 'clinic', new.clinic,
                         'note', coalesce(v_last ->> 'note', '')));
  elsif (new.tracking_number is distinct from old.tracking_number) or (new.carrier is distinct from old.carrier) then
    perform public._audit('order_shipping', 'order', new.id,
      jsonb_build_object('carrier', new.carrier, 'tracking_number', new.tracking_number));
  elsif jsonb_typeof(new.design_versions) = 'array' and jsonb_typeof(old.design_versions) = 'array'
        and jsonb_array_length(new.design_versions) > jsonb_array_length(old.design_versions) then
    perform public._audit('order_design', 'order', new.id,
      jsonb_build_object('version', jsonb_array_length(new.design_versions)));
  end if;
  return null;
end $$;
drop trigger if exists trg_orders_audit on public.cnc_orders;
create trigger trg_orders_audit after update on public.cnc_orders
  for each row execute function public._trg_orders_audit();

-- 충전 승인 · 거절 기록
create or replace function public._trg_topups_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public._audit('topup_' || new.status, 'topup', new.id,
      jsonb_build_object('user_id', new.user_id, 'credits', new.credits, 'total', new.total,
                         'reason', coalesce(new.reject_reason, '')));
  end if;
  return null;
end $$;
drop trigger if exists trg_topups_audit on public.topup_requests;
create trigger trg_topups_audit after update on public.topup_requests
  for each row execute function public._trg_topups_audit();

-- 크레딧 지급(보너스) · 차감 · 현금 환불 기록 (충전 승인·주문 취소는 위 기록이 있어서 빼요)
create or replace function public._trg_credit_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_source text;
begin
  if new.type = 'charge' and new.lot_id is not null then
    select source into v_source from public.credit_lots where id = new.lot_id;
    if v_source = 'bonus' then
      perform public._audit('credits_added', 'customer', new.user_id::text,
        jsonb_build_object('amount', new.amount, 'description', new.description));
    end if;
  elsif new.type = 'adjust' then
    perform public._audit('credits_removed', 'customer', new.user_id::text,
      jsonb_build_object('amount', new.amount, 'description', new.description));
  elsif new.type = 'refund_cash' then
    perform public._audit('refund_cash', 'customer', new.user_id::text,
      jsonb_build_object('credits', new.amount, 'amount_thb', new.amount_thb, 'description', new.description));
  end if;
  return null;
end $$;
drop trigger if exists trg_credit_audit on public.credit_history;
create trigger trg_credit_audit after insert on public.credit_history
  for each row execute function public._trg_credit_audit();

-- 설정 변경 기록 (가격·결제·회사 정보·법적 버전·LINE 알림 대상)
create or replace function public._trg_settings_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  perform public._audit('settings_changed', tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'version', ''),
    jsonb_build_object('op', lower(tg_op)) ||
    case when tg_op = 'UPDATE' then jsonb_build_object('changed',
      (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(to_jsonb(new)) k
        where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k and k not in ('updated_at')))
    else jsonb_build_object('row', v_row - 'created_at') end);
  return null;
end $$;
drop trigger if exists trg_settings_audit on public.credit_packages;
create trigger trg_settings_audit after insert or update or delete on public.credit_packages
  for each row execute function public._trg_settings_audit();
drop trigger if exists trg_settings_audit on public.payment_settings;
create trigger trg_settings_audit after update on public.payment_settings
  for each row execute function public._trg_settings_audit();
drop trigger if exists trg_settings_audit on public.company_settings;
create trigger trg_settings_audit after update on public.company_settings
  for each row execute function public._trg_settings_audit();
drop trigger if exists trg_settings_audit on public.legal_versions;
create trigger trg_settings_audit after insert on public.legal_versions
  for each row execute function public._trg_settings_audit();


-- ================================================================
-- 6) 팀 관리 (owner 만)
-- ================================================================
-- 팀 목록
create or replace function public.admin_list_team()
returns table (user_id uuid, email text, display_name text, role text, added_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  return query
    select a.user_id, coalesce(u.email::text, ''), coalesce(a.display_name, ''), a.role,
           case when a.added_by is null then '' else public._admin_name(a.added_by) end, a.created_at
      from public.admins a
      left join auth.users u on u.id = a.user_id
     order by public._admin_role_rank(a.role) desc, a.created_at;
end $$;

-- 멤버 추가 (이미 allabut.com 에 가입한 이메일만)
create or replace function public.admin_add_member(p_email text, p_role text default 'staff', p_display_name text default '')
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_role not in ('owner', 'manager', 'staff') then raise exception 'INVALID_ROLE'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if exists (select 1 from public.admins where user_id = v_user) then raise exception 'ALREADY_MEMBER'; end if;
  insert into public.admins (user_id, role, display_name, added_by)
  values (v_user, p_role, left(trim(coalesce(p_display_name, '')), 60), auth.uid());
  perform public._audit('team_add', 'member', v_user::text,
    jsonb_build_object('email', lower(trim(p_email)), 'role', p_role, 'name', trim(coalesce(p_display_name, ''))));
  return v_user;
end $$;

-- 역할 바꾸기 (마지막 owner 는 강등 불가)
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_role not in ('owner', 'manager', 'staff') then raise exception 'INVALID_ROLE'; end if;
  select role into v_old from public.admins where user_id = p_user for update;
  if v_old is null then raise exception 'NOT_MEMBER'; end if;
  if v_old = p_role then return; end if;
  if v_old = 'owner' and (select count(*) from public.admins where role = 'owner') <= 1 then
    raise exception 'LAST_OWNER';
  end if;
  update public.admins set role = p_role where user_id = p_user;
  perform public._audit('team_role', 'member', p_user::text,
    jsonb_build_object('from', v_old, 'to', p_role, 'name', public._admin_name(p_user)));
end $$;

-- 이름 바꾸기 (알림·기록에 보이는 이름)
create or replace function public.admin_set_member_name(p_user uuid, p_display_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  update public.admins set display_name = left(trim(coalesce(p_display_name, '')), 60) where user_id = p_user;
  if not found then raise exception 'NOT_MEMBER'; end if;
  perform public._audit('team_name', 'member', p_user::text, jsonb_build_object('name', trim(coalesce(p_display_name, ''))));
end $$;

-- 제거 (자기 자신·마지막 owner 는 불가)
create or replace function public.admin_remove_member(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_user = auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;
  select role into v_old from public.admins where user_id = p_user for update;
  if v_old is null then raise exception 'NOT_MEMBER'; end if;
  if v_old = 'owner' and (select count(*) from public.admins where role = 'owner') <= 1 then
    raise exception 'LAST_OWNER';
  end if;
  perform public._audit('team_remove', 'member', p_user::text,
    jsonb_build_object('role', v_old, 'name', public._admin_name(p_user)));
  delete from public.admins where user_id = p_user;
end $$;

-- admins 표는 브라우저에서 직접 바꾸지 못해요 (위 함수로만)
revoke insert, update, delete on public.admins from anon, authenticated;


-- ================================================================
-- 7) 관리자 LINE 알림 대상 · 그룹 연결 코드
-- ================================================================
create table if not exists public.admin_notify_targets (
  id          bigint generated by default as identity primary key,
  kind        text not null default 'group' check (kind in ('group', 'user')),
  line_id     text not null,
  name        text not null default '',
  categories  text[] not null default '{orders,topups,account}',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint admin_notify_targets_line_id_key unique (line_id)
);
alter table public.admin_notify_targets enable row level security;
drop policy if exists "notify_targets: owner read" on public.admin_notify_targets;
drop policy if exists "notify_targets: owner update" on public.admin_notify_targets;
drop policy if exists "notify_targets: owner delete" on public.admin_notify_targets;
create policy "notify_targets: owner read" on public.admin_notify_targets
  for select to authenticated using (public.has_admin_role('owner'));
create policy "notify_targets: owner update" on public.admin_notify_targets
  for update to authenticated using (public.has_admin_role('owner')) with check (public.has_admin_role('owner'));
create policy "notify_targets: owner delete" on public.admin_notify_targets
  for delete to authenticated using (public.has_admin_role('owner'));
revoke insert on public.admin_notify_targets from anon, authenticated;
grant select, update, delete on public.admin_notify_targets to authenticated;
-- 새 그룹은 line-webhook(서버)만 추가해요

drop trigger if exists trg_settings_audit on public.admin_notify_targets;
create trigger trg_settings_audit after update or delete on public.admin_notify_targets
  for each row execute function public._trg_settings_audit();

create table if not exists public.admin_group_link_codes (
  code        text primary key,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  target_id   bigint references public.admin_notify_targets(id) on delete set null
);
alter table public.admin_group_link_codes enable row level security;
drop policy if exists "group_codes: owner read" on public.admin_group_link_codes;
create policy "group_codes: owner read" on public.admin_group_link_codes
  for select to authenticated using (public.has_admin_role('owner'));
revoke insert, update, delete on public.admin_group_link_codes from anon, authenticated;
grant select on public.admin_group_link_codes to authenticated;

-- 그룹 연결 코드 만들기 (30분 유효) → { code, expires_at }
create or replace function public.admin_create_group_code()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 헷갈리는 0 O 1 I 빼고
  v_code text;
  v_exp timestamptz := now() + interval '30 minutes';
  i integer;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  -- 내가 만든 아직 안 쓴 코드는 끝내요 (가장 최근 코드 하나만 유효)
  update public.admin_group_link_codes set expires_at = now()
   where created_by = auth.uid() and used_at is null and expires_at > now();
  loop
    v_code := 'GRP-';
    for i in 1..4 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.admin_group_link_codes where code = v_code);
  end loop;
  insert into public.admin_group_link_codes (code, created_by, expires_at) values (v_code, auth.uid(), v_exp);
  perform public._audit('group_code', 'line_group', v_code, '{}'::jsonb);
  return jsonb_build_object('code', v_code, 'expires_at', v_exp);
end $$;


-- ================================================================
-- 8) 실행 권한
-- ================================================================
revoke all on function public._admin_role_rank(text) from public, anon;
revoke all on function public._admin_name(uuid) from public, anon, authenticated;
revoke all on function public._audit(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public._trg_orders_by_name() from public, anon, authenticated;
revoke all on function public._trg_orders_audit() from public, anon, authenticated;
revoke all on function public._trg_topups_audit() from public, anon, authenticated;
revoke all on function public._trg_credit_audit() from public, anon, authenticated;
revoke all on function public._trg_settings_audit() from public, anon, authenticated;
revoke all on function public.admin_role() from public, anon;
revoke all on function public.has_admin_role(text) from public, anon;
revoke all on function public.admin_me() from public, anon;
revoke all on function public.admin_list_team() from public, anon;
revoke all on function public.admin_add_member(text, text, text) from public, anon;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
revoke all on function public.admin_set_member_name(uuid, text) from public, anon;
revoke all on function public.admin_remove_member(uuid) from public, anon;
revoke all on function public.admin_create_group_code() from public, anon;

grant execute on function public._admin_role_rank(text) to authenticated;
grant execute on function public.admin_role() to authenticated;
grant execute on function public.has_admin_role(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_me() to authenticated;
grant execute on function public.admin_list_team() to authenticated;
grant execute on function public.admin_add_member(text, text, text) to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_set_member_name(uuid, text) to authenticated;
grant execute on function public.admin_remove_member(uuid) to authenticated;
grant execute on function public.admin_create_group_code() to authenticated;
