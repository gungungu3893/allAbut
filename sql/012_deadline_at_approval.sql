-- ================================================================
-- allAbut — 012: 납품일(deadline)은 새 주문이 아니라 "디자인 승인" 때 정해요
-- ================================================================
-- 이유: 디자인을 주고받는 동안 시간이 지나서, 주문할 때 미리 정한 납기를 못 지킬 수 있어요.
--
-- 바뀌는 것
--   1) cnc_orders.deadline: null 허용 (이미 들어온 주문 값은 그대로)
--   2) payment_settings.min_lead_days (새 설정, 기본 1 = 승인 다음 날부터, 0~30) — owner 가 Settings 에서
--   3) create_cnc_order: 008 의 최신 정의(p_use_free · 등록 치과 정보 · 무료/충전 차감 · bonus_used) 그대로,
--      deadline 만 항상 null 로 저장 (p_deadline 인자는 예전 호출이 깨지지 않게 남겨 두고 무시해요)
--   4) update_my_cnc_order: deadline 은 고객이 못 바꿔요 (null 로 넘어와도 기존 값 유지)
--   5) customer_approve_design(p_id, p_deadline, p_note): 고객 디자인 승인 + 납품일 확정을 한 번에
--        - stage 가 design_ready 일 때만 (아니면 STAGE_CHANGED), 납품일 필수 (DEADLINE_REQUIRED)
--        - 납품일 >= 방콕 오늘 + min_lead_days (아니면 DEADLINE_TOO_EARLY)
--        - review_history 에 { action: 'approved', deadline, note, date }
--        - design_ready 인데 deadline 이 비어 있던 예전 주문도 여기서 날짜를 고르면 정상 처리
--   6) customer_cnc_action: 수정 요청(reject) · 수령(receive) 은 그대로. 'approve' 는 납품일이 필요해서 DEADLINE_REQUIRED
--      (예전 화면이 남아 있으면 승인 대신 안내가 떠요 → 새 화면은 customer_approve_design 을 불러요)
--   7) admin_set_deadline(p_id, p_deadline, p_reason): 관리자 납기 변경 (manager 이상, 사유 필수)
--        - review_history { action: 'deadline_changed', old_deadline, deadline, note, by: 'admin' } + admin_audit_log 'order_deadline'
--        - LINE 은 line-notify 가 cnc_orders UPDATE 에서 deadline 이 바뀐 것을 보고 고객 카드 + 관리자 사본
--   8) 관리자 대시보드 집계(기한 임박)는 화면에서 deadline 이 있는 주문만 세요 (DB 변경 없음)
--
-- 실행 순서: 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012
--   ⚠️ 008 을 다시 실행하면 create_cnc_order 가 008 모양(p_deadline 저장)으로 돌아가요 → 009 → 010 → 012 도 다시
-- 두 번 실행해도 안전 (if not exists / create or replace / drop constraint if exists)


-- ================================================================
-- 1) deadline: null 허용
-- ================================================================
alter table public.cnc_orders alter column deadline drop not null;


-- ================================================================
-- 2) 설정: 승인 후 최소 일수 (방콕 날짜 기준, 기본 1)
-- ================================================================
alter table public.payment_settings add column if not exists min_lead_days integer not null default 1;
alter table public.payment_settings drop constraint if exists payment_settings_min_lead_days_check;
alter table public.payment_settings add constraint payment_settings_min_lead_days_check check (min_lead_days between 0 and 30);

-- 가장 빠른 납품일 (방콕 오늘 + min_lead_days)
create or replace function public._earliest_deadline()
returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone 'Asia/Bangkok')::date
         + coalesce((select min_lead_days from public.payment_settings where id = 1), 1);
$$;

-- 화면용: 가장 빠른 납품일 · 최소 일수 (로그인한 사람)
create or replace function public.get_deadline_rules()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'earliest', public._earliest_deadline(),
    'min_lead_days', coalesce((select min_lead_days from public.payment_settings where id = 1), 1),
    'today', (now() at time zone 'Asia/Bangkok')::date);
$$;
revoke all on function public.get_deadline_rules() from public, anon;
grant execute on function public.get_deadline_rules() to authenticated;


-- ================================================================
-- 3) 주문 만들기 — 008 정의 그대로, deadline 만 null
--    (인자 모양이 008 과 같아서 create or replace 로 바꿔요. p_deadline 은 받아도 저장하지 않아요)
-- ================================================================
create or replace function public.create_cnc_order(
  p_patient text, p_deadline date, p_clinic text, p_addr text,
  p_phone text, p_line_id text, p_cases jsonb, p_use_free boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_teeth integer;
  v_id text;
  v_balance integer;
  v_paid integer;
  v_free_avail integer;
  v_free_used integer := 0;
  v_prof record;
  v_clinic text := p_clinic;
  v_addr text := p_addr;
  v_phone text := p_phone;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;

  -- 무료 크레딧 주문: 배송 정보는 화면 값이 아니라 등록된 치과 정보로 (DB 가 정해요)
  if coalesce(p_use_free, false) then
    select reg_clinic, reg_addr, reg_phone, clinic_locked_at into v_prof from public.profiles where id = v_uid;
    if v_prof.clinic_locked_at is null then raise exception 'NO_REGISTERED_CLINIC'; end if;
    v_clinic := v_prof.reg_clinic; v_addr := v_prof.reg_addr; v_phone := v_prof.reg_phone;
  end if;

  if coalesce(trim(v_clinic), '') = '' or coalesce(trim(v_addr), '') = '' or coalesce(trim(v_phone), '') = '' then
    raise exception 'DELIVERY_REQUIRED';
  end if;

  select coalesce(sum(jsonb_array_length(coalesce(c -> 'teeth', '[]'::jsonb))), 0)
    into v_teeth from jsonb_array_elements(coalesce(p_cases, '[]'::jsonb)) c;
  if v_teeth < 1 then raise exception 'NO_TEETH'; end if;

  -- 같은 사용자의 동시 주문을 줄 세우기 (지갑 행 잠금)
  insert into public.credit_wallets (user_id, balance) values (v_uid, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = v_uid for update;
  perform public._credit_expire_lots(v_uid);

  select coalesce(sum(remaining) filter (where restriction is null), 0),
         coalesce(sum(remaining) filter (where restriction is not null), 0)
    into v_paid, v_free_avail
    from public.credit_lots where user_id = v_uid and remaining > 0 and expires_at > now();

  if coalesce(p_use_free, false) then
    if v_paid + v_free_avail < v_teeth then raise exception 'INSUFFICIENT_CREDITS'; end if;
  elsif v_paid < v_teeth then
    -- 산 크레딧은 모자라지만 무료 크레딧을 쓰면 충분 → 등록 주소로 주문해야 써요
    if v_paid + v_free_avail >= v_teeth and v_free_avail > 0 then raise exception 'bonus_address_only'; end if;
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  -- 무료 먼저 쓰는 수를 미리 정해서 주문과 함께 저장 (새 주문 LINE 알림이 INSERT 때 bonus_used 를 볼 수 있게)
  v_free_used := case when coalesce(p_use_free, false) then least(v_free_avail, v_teeth) else 0 end;

  -- 납품일은 디자인 승인 때 정해요 (012) → 새 주문은 항상 null
  v_id := 'CA' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.cnc_order_seq')::text, 4, '0');
  insert into public.cnc_orders (id, user_id, patient, deadline, clinic, addr, phone, line_id, cases, teeth_count, credits_used, addr_norm, bonus_used)
  values (v_id, v_uid, coalesce(p_patient, ''), null, trim(v_clinic), trim(v_addr), trim(v_phone), coalesce(p_line_id, ''), p_cases, v_teeth, v_teeth,
          public._norm_addr(v_addr), v_free_used);

  if public._credit_take_mode(v_uid, v_teeth, v_id, case when coalesce(p_use_free, false) then 'free_first' else 'paid' end) <> v_free_used then
    raise exception 'CREDIT_SPLIT_MISMATCH';   -- 일어나면 안 돼요 (지갑 행을 잠가서 그 사이 바뀌지 않아요)
  end if;
  v_balance := public._credit_recalc(v_uid);
  insert into public.credit_history (user_id, amount, type, order_id, description)
  values (v_uid, -v_teeth, 'use', v_id, 'CNC order ' || v_id || ' (' || v_teeth || ' teeth'
          || case when v_free_used > 0 then ', ' || v_free_used || ' free' else '' end || ')');

  return jsonb_build_object('id', v_id, 'teeth', v_teeth, 'balance', v_balance, 'bonus_used', v_free_used);
end $$;
grant execute on function public.create_cnc_order(text, date, text, text, text, text, jsonb, boolean) to authenticated;


-- ================================================================
-- 4) 고객 주문 수정 (submitted 일 때만) — deadline 은 그대로 (고객이 못 바꿔요)
-- ================================================================
create or replace function public.update_my_cnc_order(
  p_id text, p_patient text, p_deadline date, p_clinic text, p_addr text, p_phone text, p_line_id text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.cnc_orders
     set patient = coalesce(p_patient, patient),
         clinic = coalesce(nullif(trim(p_clinic), ''), clinic),
         addr = coalesce(nullif(trim(p_addr), ''), addr),
         phone = coalesce(nullif(trim(p_phone), ''), phone),
         line_id = coalesce(p_line_id, ''), updated_at = now()
   where id = p_id and user_id = auth.uid() and stage = 'submitted';
  if not found then raise exception 'NOT_EDITABLE'; end if;
end $$;
revoke all on function public.update_my_cnc_order(text, text, date, text, text, text, text) from public, anon;
grant execute on function public.update_my_cnc_order(text, text, date, text, text, text, text) to authenticated;


-- ================================================================
-- 5) 고객 디자인 승인 + 납품일 확정 (한 번에)
-- ================================================================
create or replace function public.customer_approve_design(p_id text, p_deadline date, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_stage text;
  v_earliest date := public._earliest_deadline();
begin
  if auth.uid() is null then raise exception 'NOT_LOGGED_IN'; end if;
  select stage into v_stage from public.cnc_orders where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_stage <> 'design_ready' then raise exception 'STAGE_CHANGED'; end if;
  if p_deadline is null then raise exception 'DEADLINE_REQUIRED'; end if;
  if p_deadline < v_earliest then raise exception 'DEADLINE_TOO_EARLY'; end if;

  update public.cnc_orders
     set stage = 'approved', deadline = p_deadline, updated_at = now(),
         review_history = coalesce(review_history, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object('action', 'approved', 'deadline', p_deadline, 'note', coalesce(p_note, ''), 'date', now()))
   where id = p_id;
  return jsonb_build_object('stage', 'approved', 'deadline', p_deadline);
end $$;
revoke all on function public.customer_approve_design(text, date, text) from public, anon;
grant execute on function public.customer_approve_design(text, date, text) to authenticated;


-- ================================================================
-- 6) 고객 액션 — 수정 요청 · 수령은 그대로, 승인은 납품일이 필요해요 (customer_approve_design)
-- ================================================================
create or replace function public.customer_cnc_action(p_id text, p_action text, p_note text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare v_stage text; v_new text; v_action text;
begin
  select stage into v_stage from public.cnc_orders where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_action = 'approve' and v_stage = 'design_ready' then
    raise exception 'DEADLINE_REQUIRED';   -- 승인은 customer_approve_design(p_id, p_deadline) 으로
  elsif p_action = 'reject' and v_stage = 'design_ready' then
    if coalesce(trim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;
    v_new := 'design_revision'; v_action := 'rejected';
  elsif p_action = 'receive' and v_stage = 'shipped' then v_new := 'done'; v_action := 'received';
  else raise exception 'INVALID_ACTION';
  end if;

  update public.cnc_orders
     set stage = v_new, updated_at = now(),
         review_history = coalesce(review_history, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object('action', v_action, 'note', coalesce(p_note, ''), 'date', now()))
   where id = p_id;
  return v_new;
end $$;
revoke all on function public.customer_cnc_action(text, text, text) from public, anon;
grant execute on function public.customer_cnc_action(text, text, text) to authenticated;


-- ================================================================
-- 7) 관리자 납기 변경 (manager 이상, 사유 필수)
-- ================================================================
create or replace function public.admin_set_deadline(p_id text, p_deadline date, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old date;
  v_stage text;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if p_deadline is null then raise exception 'DEADLINE_REQUIRED'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  select deadline, stage into v_old, v_stage from public.cnc_orders where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_stage in ('done', 'cancelled') then raise exception 'NOT_EDITABLE'; end if;
  if v_old is not distinct from p_deadline then return jsonb_build_object('deadline', p_deadline, 'changed', false); end if;

  update public.cnc_orders
     set deadline = p_deadline, updated_at = now(),
         review_history = coalesce(review_history, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object('action', 'deadline_changed', 'old_deadline', v_old, 'deadline', p_deadline,
                              'note', trim(p_reason), 'date', now(), 'by', 'admin'))
   where id = p_id;
  perform public._audit('order_deadline', 'order', p_id,
    jsonb_build_object('from', v_old, 'to', p_deadline, 'reason', trim(p_reason)));
  return jsonb_build_object('deadline', p_deadline, 'old_deadline', v_old, 'changed', true);
end $$;
revoke all on function public.admin_set_deadline(text, date, text) from public, anon;
grant execute on function public.admin_set_deadline(text, date, text) to authenticated;
