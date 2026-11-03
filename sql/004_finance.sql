-- ================================================================
-- allAbut 004 — 월별 매출(입금) 집계 · 사용된 크레딧 가치 · 미사용 크레딧 · CSV 내보내기
-- ================================================================
-- 실행: Supabase → SQL Editor → 이 파일 전체 붙여넣고 Run (002, 003 다음. 두 번 실행해도 같은 결과)
-- ⚠️ 나중에 002_credit_topups.sql 을 다시 실행했다면 이 파일도 다시 한 번 실행해 주세요
--    (002 가 admin_refund_cash 를 예전 모양으로 되돌리기 때문이에요)
--
-- 바뀌는 것
--  1) credit_history.amount_thb: 현금 환불 금액(THB)을 숫자로 저장 (지금까지는 설명 글자 안에만 있었어요)
--     → 기존 'refund_cash' 기록은 설명 글자에서 금액을 읽어 채워요
--  2) admin_refund_cash: 환불 금액을 amount_thb 에도 저장 (나머지 동작은 002 와 같음)
--  3) 관리자 전용 집계 함수 4개 (모두 방콕 시간 기준 달)
--     admin_finance_month(년, 월) / admin_finance_trend(개월 수) / admin_outstanding_credits() / admin_topups_export(년, 월)
--
-- 금액 기준
--  - 입금(topups): 승인된 충전의 VAT 포함 총액 (승인일 reviewed_at 기준 달)
--  - 사용된 크레딧 가치(consumed): 그 달 주문에 쓰인 크레딧 × 그 묶음의 구매 단가 (VAT 별도). 취소로 돌려준 것은 빼요
--  - 만료 가치(expired): 만료된 크레딧 × 묶음 단가 (VAT 별도)
--  - 보너스·이전 잔액 크레딧은 단가 0 → 가치 0, 수량만 따로 보여줘요


-- ================================================================
-- 1) 현금 환불 금액 칸
-- ================================================================
alter table public.credit_history add column if not exists amount_thb numeric(12,2);

-- 기존 기록 채우기: 'Cash refund THB 17,227.00 · ...' → 17227.00
update public.credit_history
   set amount_thb = replace(substring(description from 'Cash refund THB ([0-9,]+\.[0-9]{2})'), ',', '')::numeric
 where type = 'refund_cash' and amount_thb is null
   and description ~ 'Cash refund THB [0-9,]+\.[0-9]{2}';


-- ================================================================
-- 2) admin_refund_cash — 환불 금액을 amount_thb 에도 저장
-- ================================================================
create or replace function public.admin_refund_cash(p_user uuid, p_lot_ids uuid[], p_amount numeric, p_note text default '')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_quote jsonb;
  v_lot jsonb;
  v_max numeric := 0;
  v_credits integer := 0;
  v_count integer := 0;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_lot_ids is null or array_length(p_lot_ids, 1) is null then raise exception 'NO_LOTS'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;

  perform public._credit_recalc(p_user);
  v_quote := public._credit_refund_quote(p_user);
  for v_lot in select * from jsonb_array_elements(v_quote -> 'lots') loop
    if (v_lot ->> 'lot_id')::uuid = any (p_lot_ids) then
      if (v_lot ->> 'rule') not in ('full', 'recalculated') then raise exception 'LOT_NOT_REFUNDABLE'; end if;
      v_max := v_max + (v_lot ->> 'refundable')::numeric;
      v_credits := v_credits + (v_lot ->> 'remaining')::int;
      v_count := v_count + 1;
    end if;
  end loop;
  if v_count <> array_length(p_lot_ids, 1) then raise exception 'LOT_NOT_REFUNDABLE'; end if;
  if p_amount > v_max + 0.005 then raise exception 'AMOUNT_TOO_HIGH'; end if;

  update public.credit_lots set remaining = 0 where user_id = p_user and id = any (p_lot_ids);
  insert into public.credit_history (user_id, amount, type, description, amount_thb)
  values (p_user, -v_credits, 'refund_cash',
          'Cash refund THB ' || to_char(p_amount, 'FM999,999,990.00') || coalesce(' · ' || nullif(trim(p_note), ''), ''),
          round(p_amount, 2));
  return public._credit_recalc(p_user);
end $$;


-- ================================================================
-- 3) 집계 도구: 방콕 시간 기준 달의 시작·끝
-- ================================================================
create or replace function public._bkk_month_start(p_year int, p_month int)
returns timestamptz
language sql immutable as $$
  select (make_date(p_year, p_month, 1)::timestamp) at time zone 'Asia/Bangkok';
$$;

create or replace function public._bkk_month_end(p_year int, p_month int)
returns timestamptz
language sql immutable as $$
  select ((make_date(p_year, p_month, 1) + interval '1 month')::timestamp) at time zone 'Asia/Bangkok';
$$;


-- ================================================================
-- 4) admin_finance_month(년, 월) — 그 달 매출 요약
-- ================================================================
create or replace function public.admin_finance_month(p_year int, p_month int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'INVALID_ACTION'; end if;
  v_start := public._bkk_month_start(p_year, p_month);
  v_end := public._bkk_month_end(p_year, p_month);

  with
  t as (
    select * from public.topup_requests
     where status = 'approved' and reviewed_at >= v_start and reviewed_at < v_end
  ),
  rf as (
    select * from public.credit_history
     where type = 'refund_cash' and created_at >= v_start and created_at < v_end
  ),
  used as (
    select u.quantity, l.unit_price
      from public.credit_lot_usage u join public.credit_lots l on l.id = u.lot_id
     where u.created_at >= v_start and u.created_at < v_end and u.restored_at is null
  ),
  exp as (
    select h.amount, l.unit_price
      from public.credit_history h left join public.credit_lots l on l.id = h.lot_id
     where h.type = 'expire' and h.created_at >= v_start and h.created_at < v_end
  ),
  bonus as (
    select quantity from public.credit_lots
     where source = 'bonus' and created_at >= v_start and created_at < v_end
  ),
  pkg as (
    select credits, unit_price, count(*) as cnt, sum(credits) as total_credits, sum(total) as total
      from t group by credits, unit_price
  ),
  topc as (
    select t.user_id, sum(t.total) as total, count(*) as cnt,
           coalesce(nullif(p.clinic_name, ''), p.nickname, '') as name
      from t left join public.profiles p on p.id = t.user_id
     group by t.user_id, p.clinic_name, p.nickname
     order by sum(t.total) desc
     limit 5
  )
  select jsonb_build_object(
    'year', p_year, 'month', p_month,
    'topups', (select jsonb_build_object(
        'count', count(*), 'credits', coalesce(sum(credits), 0),
        'subtotal', coalesce(sum(subtotal), 0), 'vat', coalesce(sum(vat_amount), 0), 'total', coalesce(sum(total), 0)) from t),
    'pending', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total), 0))
                  from public.topup_requests where status = 'pending' and created_at >= v_start and created_at < v_end),
    'pending_now', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total), 0))
                      from public.topup_requests where status = 'pending'),
    'refunds', (select jsonb_build_object('count', count(*), 'credits', coalesce(-sum(amount), 0), 'amount', coalesce(sum(amount_thb), 0)) from rf),
    'net', (select coalesce(sum(total), 0) from t) - (select coalesce(sum(amount_thb), 0) from rf),
    'consumed', (select jsonb_build_object('credits', coalesce(sum(quantity), 0), 'value', coalesce(round(sum(quantity * unit_price), 2), 0)) from used),
    'expired', (select jsonb_build_object('credits', coalesce(-sum(amount), 0), 'value', coalesce(round(sum(-amount * coalesce(unit_price, 0)), 2), 0)) from exp),
    'bonus', (select jsonb_build_object('credits', coalesce(sum(quantity), 0)) from bonus),
    'by_package', (select coalesce(jsonb_agg(jsonb_build_object(
        'credits', credits, 'unit_price', unit_price, 'count', cnt, 'total_credits', total_credits, 'total', total) order by credits), '[]'::jsonb) from pkg),
    'top_customers', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'name', name, 'count', cnt, 'total', total) order by total desc), '[]'::jsonb) from topc)
  ) into v;
  return v;
end $$;


-- ================================================================
-- 5) admin_finance_trend(개월 수) — 최근 n개월 (오래된 달 → 이번 달)
-- ================================================================
create or replace function public.admin_finance_trend(p_months int default 12)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_now date := (now() at time zone 'Asia/Bangkok')::date;
  v_n int := greatest(1, least(coalesce(p_months, 12), 36));
  v jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  with months as (
    select (date_trunc('month', v_now) - (i || ' months')::interval)::date as d
      from generate_series(v_n - 1, 0, -1) i
  ),
  bounds as (
    select d, extract(year from d)::int as y, extract(month from d)::int as m,
           (d::timestamp) at time zone 'Asia/Bangkok' as s,
           ((d + interval '1 month')::timestamp) at time zone 'Asia/Bangkok' as e
      from months
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'year', b.y, 'month', b.m,
      'topups', (select coalesce(sum(total), 0) from public.topup_requests
                  where status = 'approved' and reviewed_at >= b.s and reviewed_at < b.e),
      'consumed', (select coalesce(round(sum(u.quantity * l.unit_price), 2), 0)
                     from public.credit_lot_usage u join public.credit_lots l on l.id = u.lot_id
                    where u.created_at >= b.s and u.created_at < b.e and u.restored_at is null),
      'refunds', (select coalesce(sum(amount_thb), 0) from public.credit_history
                   where type = 'refund_cash' and created_at >= b.s and created_at < b.e)
    ) order by b.d), '[]'::jsonb)
    into v from bounds b;
  return v;
end $$;


-- ================================================================
-- 6) admin_outstanding_credits() — 지금 시점 미사용(만료 전) 크레딧
-- ================================================================
create or replace function public.admin_outstanding_credits()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select jsonb_build_object(
    'as_of', now(),
    'paid_credits', coalesce(sum(remaining) filter (where unit_price > 0), 0),
    'paid_value', coalesce(round(sum(remaining * unit_price) filter (where unit_price > 0), 2), 0),
    'free_credits', coalesce(sum(remaining) filter (where unit_price = 0), 0),
    'customers', count(distinct user_id)
  ) into v
  from public.credit_lots
  where remaining > 0 and expires_at > now();
  return v;
end $$;


-- ================================================================
-- 7) admin_topups_export(년, 월) — 그 달 승인된 충전 목록 (CSV 용)
-- ================================================================
create or replace function public.admin_topups_export(p_year int, p_month int)
returns table (
  request_id text, approved_at text, customer_email text, clinic_name text, tax_id text,
  package_credits integer, credits integer, unit_price numeric, subtotal numeric, vat numeric, total numeric
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return query
    select t.id,
           to_char(t.reviewed_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'),
           coalesce(u.email::text, ''),
           coalesce(p.clinic_name, ''),
           coalesce(p.tax_id, ''),
           coalesce(pk.credits, t.credits),
           t.credits, t.unit_price, t.subtotal, t.vat_amount, t.total
      from public.topup_requests t
      left join public.profiles p on p.id = t.user_id
      left join auth.users u on u.id = t.user_id
      left join public.credit_packages pk on pk.id = t.package_id
     where t.status = 'approved'
       and t.reviewed_at >= public._bkk_month_start(p_year, p_month)
       and t.reviewed_at < public._bkk_month_end(p_year, p_month)
     order by t.reviewed_at, t.id;
end $$;


-- ================================================================
-- 8) 실행 권한 — 로그인 사용자만 (함수 안에서 관리자 확인)
-- ================================================================
revoke all on function public.admin_refund_cash(uuid, uuid[], numeric, text) from public, anon;
grant execute on function public.admin_refund_cash(uuid, uuid[], numeric, text) to authenticated;
revoke all on function public._bkk_month_start(int, int) from public, anon;
revoke all on function public._bkk_month_end(int, int) from public, anon;
revoke all on function public.admin_finance_month(int, int) from public, anon;
revoke all on function public.admin_finance_trend(int) from public, anon;
revoke all on function public.admin_outstanding_credits() from public, anon;
revoke all on function public.admin_topups_export(int, int) from public, anon;
grant execute on function public._bkk_month_start(int, int) to authenticated;
grant execute on function public._bkk_month_end(int, int) to authenticated;
grant execute on function public.admin_finance_month(int, int) to authenticated;
grant execute on function public.admin_finance_trend(int) to authenticated;
grant execute on function public.admin_outstanding_credits() to authenticated;
grant execute on function public.admin_topups_export(int, int) to authenticated;
