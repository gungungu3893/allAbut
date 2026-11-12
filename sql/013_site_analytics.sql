-- ================================================================
-- allAbut — 013: 방문자 집계 (전부 카운트)
-- ================================================================
-- 목적: 나중에 광고 배너 판매용 숫자 → 걸러내지 않고 전부 기록 (로봇 · 직원 · 새로고침 포함).
--       대신 종류(is_bot · is_staff)를 같이 저장해서 관리자 화면에서 나눠 볼 수 있게 해요.
--
--   site_events          방문(visit: 사이트를 열 때마다 1번) · 페이지뷰(pageview: 화면 경로가 바뀔 때마다 1번)
--   log_site_event(...)  브라우저가 부르는 기록 함수 (로그인 전 anon 도 가능). user_id · is_staff · country 는 서버가 정해요
--   get_visit_counts()   랜딩의 TODAY / TOTAL (kind 'visit' 전부, 걸러내지 않음)
--   admin_visit_stats()  관리자 Dashboard "방문 통계" (staff 이상) — 집계는 전부 여기서
--
-- 개인정보 최소화: IP 원문 · 전체 user agent 는 저장하지 않아요.
--   visitor_id / session_id = 브라우저가 만든 무작위 UUID, 나라 = Cloudflare 가 붙이는 cf-ipcountry (두 글자)
--
-- 실행 순서: 005(has_admin_role) 다음 아무 때나 (보통 012 다음). 두 번 실행해도 안전.


-- ================================================================
-- 1) 기록 표
-- ================================================================
create table if not exists public.site_events (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  day           date not null default ((now() at time zone 'Asia/Bangkok')::date),   -- 방콕 날짜
  kind          text not null,
  visitor_id    uuid,
  session_id    uuid,
  path          text not null default '',
  referrer_host text not null default '',
  device        text not null default '',
  lang          text not null default '',
  country       text not null default '',
  user_id       uuid,
  is_bot        boolean not null default false,
  is_staff      boolean not null default false
);
alter table public.site_events drop constraint if exists site_events_kind_check;
alter table public.site_events add constraint site_events_kind_check check (kind in ('visit', 'pageview'));
alter table public.site_events drop constraint if exists site_events_device_check;
alter table public.site_events add constraint site_events_device_check check (device in ('', 'mobile', 'tablet', 'desktop'));

create index if not exists idx_site_events_day_kind on public.site_events (day, kind);
create index if not exists idx_site_events_kind on public.site_events (kind);
create index if not exists idx_site_events_visitor on public.site_events (visitor_id, created_at);

-- 직접 읽기 · 쓰기는 막고 함수로만 (정책 없음 = 아무도 못 봐요)
alter table public.site_events enable row level security;
revoke all on public.site_events from anon, authenticated;
revoke all on sequence public.site_events_id_seq from anon, authenticated;


-- ================================================================
-- 2) 기록 함수 (anon · authenticated)
-- ================================================================
create or replace function public.log_site_event(
  p_kind text, p_visitor uuid, p_session uuid, p_path text, p_referrer_host text,
  p_device text, p_lang text, p_is_bot boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_headers jsonb;
  v_country text := '';
  v_device text := lower(coalesce(trim(p_device), ''));
  v_staff boolean := false;
begin
  if p_kind not in ('visit', 'pageview') then raise exception 'INVALID_KIND'; end if;
  if v_device not in ('mobile', 'tablet', 'desktop') then v_device := ''; end if;

  -- 나라: Cloudflare 가 붙이는 요청 헤더 (없으면 빈 값). IP 는 저장하지 않아요
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_country := upper(left(regexp_replace(coalesce(v_headers ->> 'cf-ipcountry', ''), '[^A-Za-z]', '', 'g'), 2));
  exception when others then v_country := '';
  end;

  -- 직원인지: 로그인한 사람이 팀원이면 (005 has_admin_role)
  if auth.uid() is not null then
    begin v_staff := public.has_admin_role('staff'); exception when others then v_staff := false; end;
  end if;

  insert into public.site_events (kind, visitor_id, session_id, path, referrer_host, device, lang, country, user_id, is_bot, is_staff)
  values (p_kind, p_visitor, p_session,
          left(coalesce(trim(p_path), ''), 100),
          left(lower(coalesce(trim(p_referrer_host), '')), 100),
          v_device,
          left(lower(coalesce(trim(p_lang), '')), 10),
          coalesce(v_country, ''),
          auth.uid(), coalesce(p_is_bot, false), coalesce(v_staff, false));
end $$;
revoke all on function public.log_site_event(text, uuid, uuid, text, text, text, text, boolean) from public;
grant execute on function public.log_site_event(text, uuid, uuid, text, text, text, text, boolean) to anon, authenticated;


-- ================================================================
-- 3) 랜딩 TODAY / TOTAL (anon) — 방문(visit) 전부, 걸러내지 않음
-- ================================================================
create or replace function public.get_visit_counts()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', (select count(*) from public.site_events where kind = 'visit' and day = (now() at time zone 'Asia/Bangkok')::date),
    'total', (select count(*) from public.site_events where kind = 'visit'));
$$;
revoke all on function public.get_visit_counts() from public;
grant execute on function public.get_visit_counts() to anon, authenticated;


-- ================================================================
-- 4) 관리자 방문 통계 (staff 이상) — 기간(방콕 날짜) + [로봇 제외] [직원 제외]
--    summary · daily(날짜별) · hourly(하루만 고른 경우 0~23시) · 많이 본 화면 · 들어온 곳 · 기기 · 언어 · 나라 · 가입 수
-- ================================================================
create or replace function public.admin_visit_stats(
  p_from date, p_to date, p_no_bots boolean default false, p_no_staff boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Bangkok')::date);
  v_to date := coalesce(p_to, v_from);
  v_out jsonb;
begin
  if not public.has_admin_role('staff') then raise exception 'NOT_ADMIN'; end if;
  if v_to < v_from then raise exception 'INVALID_RANGE'; end if;
  if v_to - v_from > 400 then raise exception 'RANGE_TOO_LONG'; end if;

  with ev as (
    select * from public.site_events
     where day between v_from and v_to
       and (not coalesce(p_no_bots, false) or not is_bot)
       and (not coalesce(p_no_staff, false) or not is_staff)
  ),
  visits as (select * from ev where kind = 'visit'),
  -- 처음 본 방문자: 그 visitor_id 의 가장 첫 기록이 이 기간 안
  firsts as (
    select visitor_id, min(day) as first_day from public.site_events
     where visitor_id in (select distinct visitor_id from ev where visitor_id is not null)
     group by visitor_id
  )
  select jsonb_build_object(
    'from', v_from, 'to', v_to,
    'summary', jsonb_build_object(
      'visits', (select count(*) from visits),
      'visitors', (select count(distinct visitor_id) from ev where visitor_id is not null),
      'pageviews', (select count(*) from ev where kind = 'pageview'),
      'new_visitors', (select count(*) from firsts where first_day between v_from and v_to),
      'bot_visits', (select count(*) from visits where is_bot),
      'staff_visits', (select count(*) from visits where is_staff)),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'visits', (select count(*) from visits v where v.day = d.day),
        'visitors', (select count(distinct visitor_id) from ev e where e.day = d.day and e.visitor_id is not null),
        'pageviews', (select count(*) from ev e where e.day = d.day and e.kind = 'pageview'),
        'bots', (select count(*) from visits v where v.day = d.day and v.is_bot),
        'staff', (select count(*) from visits v where v.day = d.day and v.is_staff)) order by d.day)
      from (select generate_series(v_from, v_to, interval '1 day')::date as day) d), '[]'::jsonb),
    'hourly', case when v_from = v_to then coalesce((
      select jsonb_agg(jsonb_build_object(
        'hour', h.hour,
        'visits', (select count(*) from visits v where extract(hour from v.created_at at time zone 'Asia/Bangkok') = h.hour),
        'visitors', (select count(distinct visitor_id) from ev e where e.visitor_id is not null and extract(hour from e.created_at at time zone 'Asia/Bangkok') = h.hour)) order by h.hour)
      from generate_series(0, 23) as h(hour)), '[]'::jsonb) else null end,
    'paths', coalesce((select jsonb_agg(jsonb_build_object('key', path, 'n', n) order by n desc, path)
      from (select path, count(*) as n from ev where kind = 'pageview' group by path order by count(*) desc, path limit 20) x), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(jsonb_build_object('key', referrer_host, 'n', n) order by n desc, referrer_host)
      from (select referrer_host, count(*) as n from visits group by referrer_host order by count(*) desc limit 30) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('key', device, 'n', n) order by n desc)
      from (select device, count(*) as n from visits group by device) x), '[]'::jsonb),
    'langs', coalesce((select jsonb_agg(jsonb_build_object('key', lang, 'n', n) order by n desc, lang)
      from (select lang, count(*) as n from visits group by lang order by count(*) desc limit 15) x), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('key', country, 'n', n) order by n desc, country)
      from (select country, count(*) as n from visits group by country order by count(*) desc limit 15) x), '[]'::jsonb),
    -- 전환: 이 기간(방콕 날짜)에 가입한 계정 수
    'signups', (select count(*) from auth.users u
                 where (u.created_at at time zone 'Asia/Bangkok')::date between v_from and v_to)
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.admin_visit_stats(date, date, boolean, boolean) from public, anon;
grant execute on function public.admin_visit_stats(date, date, boolean, boolean) to authenticated;
