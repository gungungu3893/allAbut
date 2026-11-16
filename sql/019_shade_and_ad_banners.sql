-- ================================================================
-- allAbut — 019: ① 쉐이드는 크라운 세트 치아만  ② 광고 배너 (자리 · 관리 · 노출/클릭 집계)
-- ================================================================
-- ① create_cnc_order (018 정의 그대로 + 아래 두 가지만)
--    - 크라운 세트 치아에 쉐이드(color)가 없으면 SHADE_REQUIRED_CROWN_SET
--    - 어버트먼트 치아는 color 를 '' 로 저장 (예전 주문에 들어 있는 값은 그대로 — 화면에서만 안 보여요)
-- ② 광고 배너 (자체 배너만 — 외부 광고 스크립트 없음)
--    표 ad_banners: id · name(관리용) · advertiser · slot('landing' | 'home' | 'order_done') · image_desktop_url · image_mobile_url · link_url · alt_text
--                   · starts_at · ends_at(방콕 날짜, 비우면 무기한) · active(기본 false) · sort_order · created_by · created_at · updated_at
--      RLS 켜고 정책 없음 = 브라우저에서 표를 직접 못 읽어요 → 함수로만
--      get_active_ad_banners(p_slot)     누구나: 지금 노출 중인 것만 (켜짐 + 방콕 오늘이 기간 안), sort_order 순
--      admin_list_ad_banners()           manager 이상: 전체 + 누적 노출 · 클릭
--      admin_save_ad_banner(...)         manager 이상: 추가(p_id null) / 수정 — 링크 · 이미지 주소는 https 만
--      admin_delete_ad_banner(p_id)      manager 이상 (노출 · 클릭 기록은 남겨요)
--      admin_ad_stats(p_from, p_to)      manager 이상: 기간(방콕 날짜)별 배너마다 노출 · 클릭
--      작업 기록: 'ad_banner_saved' · 'ad_banner_deleted'
--    노출 · 클릭: site_events 에 kind 'ad_view' · 'ad_click' + 칸 ad_banner_id (log_site_event 에 p_banner 인자)
--      방문 통계(admin_visit_stats)는 kind 'visit' · 'pageview' 만 세서 숫자가 바뀌지 않아요. 보관 기간(24개월, 014)도 같이
--    Storage 공개 버킷 'ad-banners' (이미지 jpg · png · webp, 2MB, 올리기 · 지우기는 manager 이상) — 만들 권한이 없으면 notice 로 안내
--
-- 실행 순서: 018 다음. 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.
-- ⚠️ 이 파일 다음에 008 · 012 · 018 을 다시 실행하면 019 도 다시 (create_cnc_order 가 쉐이드를 모르는 모양으로 돌아가서),
--    013 을 다시 실행하면 019 도 다시 (log_site_event 가 광고 종류를 모르는 모양으로 돌아가서)


-- ================================================================
-- 1) 새 주문 — 쉐이드는 크라운 세트 치아만
-- ================================================================
create or replace function public.create_cnc_order(
  p_patient text, p_deadline date, p_clinic text, p_addr text,
  p_phone text, p_line_id text, p_cases jsonb, p_use_free boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_teeth integer;
  v_crown integer;
  v_cases jsonb;
  v_id text;
  v_balance integer;
  v_paid integer;
  v_free_avail integer;
  v_free_used integer := 0;
  v_free_taken integer := 0;
  v_need integer;
  v_p text;
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

  -- 치아마다 종류를 채워 넣어요 (없으면 abutment, 모르는 값이면 INVALID_PRODUCT)
  -- 쉐이드는 크라운 세트 치아만 (019): 어버트먼트 치아는 color 를 비워서 저장
  select coalesce(jsonb_agg(
           case when jsonb_typeof(c) = 'object' then
             jsonb_set(c, '{teeth}', coalesce((
               select jsonb_agg(case when jsonb_typeof(t) = 'object'
                                     then t || jsonb_build_object('product', public._tooth_product(t))
                                            || case when public._tooth_product(t) = 'abutment' then jsonb_build_object('color', '') else '{}'::jsonb end
                                     else t end order by o)
                 from jsonb_array_elements(case when jsonb_typeof(c -> 'teeth') = 'array' then c -> 'teeth' else '[]'::jsonb end) with ordinality x(t, o)
             ), '[]'::jsonb))
           else c end order by co), '[]'::jsonb)
    into v_cases
    from jsonb_array_elements(case when jsonb_typeof(p_cases) = 'array' then p_cases else '[]'::jsonb end) with ordinality y(c, co);

  select count(*), count(*) filter (where public._tooth_product(t) = 'crown_set')
    into v_teeth, v_crown
    from jsonb_array_elements(v_cases) c,
         jsonb_array_elements(case when jsonb_typeof(c -> 'teeth') = 'array' then c -> 'teeth' else '[]'::jsonb end) t;
  if v_teeth < 1 then raise exception 'NO_TEETH'; end if;

  -- 크라운 세트 치아는 쉐이드 필수 (019) — 어버트먼트 치아는 쉐이드 없음
  if exists (select 1
               from jsonb_array_elements(v_cases) c,
                    jsonb_array_elements(case when jsonb_typeof(c -> 'teeth') = 'array' then c -> 'teeth' else '[]'::jsonb end) t
              where public._tooth_product(t) = 'crown_set'
                and coalesce(nullif(trim(t ->> 'color'), ''), nullif(trim(t ->> 'shade'), '')) is null) then
    raise exception 'SHADE_REQUIRED_CROWN_SET';
  end if;

  -- 같은 사용자의 동시 주문을 줄 세우기 (지갑 행 잠금)
  insert into public.credit_wallets (user_id, balance) values (v_uid, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = v_uid for update;
  perform public._credit_expire_lots(v_uid);

  -- 종류마다 따로 검사 (어버트먼트 크레딧으로 크라운 세트를 못 사고, 반대도 안 돼요)
  foreach v_p in array array['abutment', 'crown_set'] loop
    v_need := case when v_p = 'crown_set' then v_crown else v_teeth - v_crown end;
    continue when v_need <= 0;
    select coalesce(sum(remaining) filter (where restriction is null), 0),
           coalesce(sum(remaining) filter (where restriction is not null), 0)
      into v_paid, v_free_avail
      from public.credit_lots where user_id = v_uid and product = v_p and remaining > 0 and expires_at > now();

    if coalesce(p_use_free, false) then
      if v_paid + v_free_avail < v_need then raise exception '%', 'INSUFFICIENT_CREDITS_' || upper(v_p); end if;
    elsif v_paid < v_need then
      -- 산 크레딧은 모자라지만 무료 크레딧을 쓰면 충분 → 등록 주소로 주문해야 써요
      if v_paid + v_free_avail >= v_need and v_free_avail > 0 then raise exception 'bonus_address_only'; end if;
      raise exception '%', 'INSUFFICIENT_CREDITS_' || upper(v_p);
    end if;
    -- 무료 먼저 쓰는 수를 미리 정해서 주문과 함께 저장 (새 주문 LINE 알림이 INSERT 때 bonus_used 를 볼 수 있게)
    if coalesce(p_use_free, false) then v_free_used := v_free_used + least(v_free_avail, v_need); end if;
  end loop;

  -- 납품일은 디자인 승인 때 정해요 (012) → 새 주문은 항상 null
  v_id := 'CA' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.cnc_order_seq')::text, 4, '0');
  insert into public.cnc_orders (id, user_id, patient, deadline, clinic, addr, phone, line_id, cases, teeth_count, credits_used, addr_norm, bonus_used, crown_set_count)
  values (v_id, v_uid, coalesce(p_patient, ''), null, trim(v_clinic), trim(v_addr), trim(v_phone), coalesce(p_line_id, ''), v_cases, v_teeth, v_teeth,
          public._norm_addr(v_addr), v_free_used, v_crown);

  foreach v_p in array array['abutment', 'crown_set'] loop
    v_need := case when v_p = 'crown_set' then v_crown else v_teeth - v_crown end;
    continue when v_need <= 0;
    v_free_taken := v_free_taken + public._credit_take_mode(v_uid, v_need, v_id,
                      case when coalesce(p_use_free, false) then 'free_first' else 'paid' end, v_p);
  end loop;
  if v_free_taken <> v_free_used then
    raise exception 'CREDIT_SPLIT_MISMATCH';   -- 일어나면 안 돼요 (지갑 행을 잠가서 그 사이 바뀌지 않아요)
  end if;
  v_balance := public._credit_recalc(v_uid);
  insert into public.credit_history (user_id, amount, type, order_id, description)
  values (v_uid, -v_teeth, 'use', v_id, 'CNC order ' || v_id || ' (' || v_teeth || ' teeth'
          || case when v_crown > 0 then ', ' || v_crown || ' crown set' else '' end
          || case when v_free_used > 0 then ', ' || v_free_used || ' free' else '' end || ')');

  return jsonb_build_object('id', v_id, 'teeth', v_teeth, 'balance', v_balance, 'bonus_used', v_free_used,
                            'abutment', v_teeth - v_crown, 'crown_set', v_crown,
                            'balance_crown_set', (select balance_crown_set from public.credit_wallets where user_id = v_uid));
end $$;


-- ================================================================
-- 2) 광고 배너 표
-- ================================================================
create table if not exists public.ad_banners (
  id                 bigint generated by default as identity primary key,
  name               text not null default '',
  advertiser         text not null default '',
  slot               text not null default 'home',
  image_desktop_url  text not null default '',
  image_mobile_url   text not null default '',
  link_url           text not null default '',
  alt_text           text not null default '',
  starts_at          date,
  ends_at            date,
  active             boolean not null default false,
  sort_order         integer not null default 0,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.ad_banners drop constraint if exists ad_banners_slot_check;
alter table public.ad_banners add constraint ad_banners_slot_check check (slot in ('landing', 'home', 'order_done'));
alter table public.ad_banners drop constraint if exists ad_banners_dates_check;
alter table public.ad_banners add constraint ad_banners_dates_check check (starts_at is null or ends_at is null or starts_at <= ends_at);
create index if not exists idx_ad_banners_slot on public.ad_banners (slot, active, sort_order);
alter table public.ad_banners enable row level security;   -- 정책 없음 = 함수로만


-- ================================================================
-- 3) 노출 · 클릭 기록 (site_events)
-- ================================================================
alter table public.site_events add column if not exists ad_banner_id bigint;
alter table public.site_events drop constraint if exists site_events_kind_check;
alter table public.site_events add constraint site_events_kind_check check (kind in ('visit', 'pageview', 'ad_view', 'ad_click'));
create index if not exists idx_site_events_ad on public.site_events (ad_banner_id, kind, day) where ad_banner_id is not null;

-- 013 정의 그대로 + 광고 종류 · p_banner (인자가 늘어서 예전 모양을 지우고 새로 만들어요)
drop function if exists public.log_site_event(text, uuid, uuid, text, text, text, text, boolean);
create or replace function public.log_site_event(
  p_kind text, p_visitor uuid, p_session uuid, p_path text, p_referrer_host text,
  p_device text, p_lang text, p_is_bot boolean default false, p_banner bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_headers jsonb;
  v_country text := '';
  v_device text := lower(coalesce(trim(p_device), ''));
  v_staff boolean := false;
begin
  if p_kind not in ('visit', 'pageview', 'ad_view', 'ad_click') then raise exception 'INVALID_KIND'; end if;
  -- 광고 기록은 있는 배너 번호가 있어야 해요 (없는 번호면 조용히 무시)
  if p_kind in ('ad_view', 'ad_click') then
    if p_banner is null or not exists (select 1 from public.ad_banners where id = p_banner) then return; end if;
  end if;
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

  insert into public.site_events (kind, visitor_id, session_id, path, referrer_host, device, lang, country, user_id, is_bot, is_staff, ad_banner_id)
  values (p_kind, p_visitor, p_session,
          left(coalesce(trim(p_path), ''), 100),
          left(lower(coalesce(trim(p_referrer_host), '')), 100),
          v_device,
          left(lower(coalesce(trim(p_lang), '')), 10),
          coalesce(v_country, ''),
          auth.uid(), coalesce(p_is_bot, false), coalesce(v_staff, false),
          case when p_kind in ('ad_view', 'ad_click') then p_banner else null end);
end $$;
revoke all on function public.log_site_event(text, uuid, uuid, text, text, text, text, boolean, bigint) from public;
grant execute on function public.log_site_event(text, uuid, uuid, text, text, text, text, boolean, bigint) to anon, authenticated;


-- ================================================================
-- 4) 배너 함수
-- ================================================================
-- https 주소만 (빈 값은 '' 로)
create or replace function public._ad_https(p_url text)
returns text
language plpgsql immutable as $$
declare v text := trim(coalesce(p_url, ''));
begin
  if v = '' then return ''; end if;
  if v !~* '^https://[^\s/]+' or length(v) > 1000 then raise exception 'INVALID_URL'; end if;
  return v;
end $$;

-- 지금 노출 중인 배너 (누구나) — p_slot 이 null 이면 모든 자리
create or replace function public.get_active_ad_banners(p_slot text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'slot', b.slot, 'image_desktop_url', b.image_desktop_url, 'image_mobile_url', b.image_mobile_url,
           'link_url', b.link_url, 'alt_text', b.alt_text, 'sort_order', b.sort_order)
         order by b.slot, b.sort_order, b.id), '[]'::jsonb)
    from public.ad_banners b
   where b.active
     and b.image_desktop_url <> ''
     and (p_slot is null or b.slot = p_slot)
     and (b.starts_at is null or b.starts_at <= (now() at time zone 'Asia/Bangkok')::date)
     and (b.ends_at is null or b.ends_at >= (now() at time zone 'Asia/Bangkok')::date);
$$;
revoke all on function public.get_active_ad_banners(text) from public;
grant execute on function public.get_active_ad_banners(text) to anon, authenticated;

-- 전체 목록 + 누적 노출 · 클릭 (manager 이상)
create or replace function public.admin_list_ad_banners()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(b) || jsonb_build_object(
             'views', (select count(*) from public.site_events e where e.ad_banner_id = b.id and e.kind = 'ad_view'),
             'clicks', (select count(*) from public.site_events e where e.ad_banner_id = b.id and e.kind = 'ad_click'))
           order by b.slot, b.sort_order, b.id)
      from public.ad_banners b), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_ad_banners() from public, anon;
grant execute on function public.admin_list_ad_banners() to authenticated;

-- 추가 (p_id null) / 수정 → 배너 id
create or replace function public.admin_save_ad_banner(
  p_id bigint, p_name text, p_advertiser text, p_slot text, p_image_desktop_url text, p_image_mobile_url text,
  p_link_url text, p_alt_text text, p_starts_at date, p_ends_at date, p_active boolean, p_sort_order integer
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := p_id;
  v_name text := left(trim(coalesce(p_name, '')), 100);
  v_desktop text := public._ad_https(p_image_desktop_url);
  v_mobile text := public._ad_https(p_image_mobile_url);
  v_link text := public._ad_https(p_link_url);
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
  if p_slot is null or p_slot not in ('landing', 'home', 'order_done') then raise exception 'INVALID_SLOT'; end if;
  if v_desktop = '' then raise exception 'IMAGE_REQUIRED'; end if;
  if v_link = '' then raise exception 'INVALID_URL'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_starts_at > p_ends_at then raise exception 'INVALID_DATES'; end if;

  if v_id is null then
    insert into public.ad_banners (name, advertiser, slot, image_desktop_url, image_mobile_url, link_url, alt_text, starts_at, ends_at, active, sort_order, created_by)
    values (v_name, left(trim(coalesce(p_advertiser, '')), 100), p_slot, v_desktop, v_mobile, v_link, left(trim(coalesce(p_alt_text, '')), 200),
            p_starts_at, p_ends_at, coalesce(p_active, false), coalesce(p_sort_order, 0), auth.uid())
    returning id into v_id;
  else
    update public.ad_banners
       set name = v_name, advertiser = left(trim(coalesce(p_advertiser, '')), 100), slot = p_slot,
           image_desktop_url = v_desktop, image_mobile_url = v_mobile, link_url = v_link, alt_text = left(trim(coalesce(p_alt_text, '')), 200),
           starts_at = p_starts_at, ends_at = p_ends_at, active = coalesce(p_active, false), sort_order = coalesce(p_sort_order, 0), updated_at = now()
     where id = v_id;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  perform public._audit('ad_banner_saved', 'ad_banner', v_id::text,
    jsonb_build_object('name', v_name, 'slot', p_slot, 'active', coalesce(p_active, false), 'new', p_id is null));
  return v_id;
end $$;
revoke all on function public.admin_save_ad_banner(bigint, text, text, text, text, text, text, text, date, date, boolean, integer) from public, anon;
grant execute on function public.admin_save_ad_banner(bigint, text, text, text, text, text, text, text, date, date, boolean, integer) to authenticated;

create or replace function public.admin_delete_ad_banner(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  delete from public.ad_banners where id = p_id returning name into v_name;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public._audit('ad_banner_deleted', 'ad_banner', p_id::text, jsonb_build_object('name', v_name));
end $$;
revoke all on function public.admin_delete_ad_banner(bigint) from public, anon;
grant execute on function public.admin_delete_ad_banner(bigint) to authenticated;

-- 기간(방콕 날짜, 둘 다 포함) 배너마다 노출 · 클릭 (지운 배너도 기록이 있으면 '#번호' 로)
create or replace function public.admin_ad_stats(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Bangkok')::date);
  v_to date := coalesce(p_to, v_from);
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if v_from > v_to or v_to - v_from > 400 then raise exception 'INVALID_DATES'; end if;
  return jsonb_build_object('from', v_from, 'to', v_to, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.ad_banner_id, 'name', coalesce(b.name, '#' || x.ad_banner_id), 'advertiser', coalesce(b.advertiser, ''),
             'slot', coalesce(b.slot, ''), 'deleted', b.id is null, 'views', x.views, 'clicks', x.clicks)
           order by coalesce(b.slot, 'zz'), coalesce(b.sort_order, 0), x.ad_banner_id)
      from (select ad_banner_id,
                   count(*) filter (where kind = 'ad_view') as views,
                   count(*) filter (where kind = 'ad_click') as clicks
              from public.site_events
             where ad_banner_id is not null and kind in ('ad_view', 'ad_click') and day between v_from and v_to
             group by ad_banner_id) x
      left join public.ad_banners b on b.id = x.ad_banner_id), '[]'::jsonb));
end $$;
revoke all on function public.admin_ad_stats(date, date) from public, anon;
grant execute on function public.admin_ad_stats(date, date) to authenticated;


-- ================================================================
-- 5) Storage: ad-banners 공개 버킷 (jpg · png · webp, 2MB) — 올리기 · 바꾸기 · 지우기 = manager 이상
--    만들 권한이 없으면 notice → Supabase → Storage 에서 직접 (LAUNCH_CHECKLIST · CLAUDE.md 안내)
-- ================================================================
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ad-banners', 'ad-banners', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "ad-banners: manager insert" on storage.objects;
  drop policy if exists "ad-banners: manager update" on storage.objects;
  drop policy if exists "ad-banners: manager delete" on storage.objects;
  drop policy if exists "ad-banners: manager read" on storage.objects;
  create policy "ad-banners: manager insert" on storage.objects
    for insert to authenticated with check (bucket_id = 'ad-banners' and public.has_admin_role('manager'));
  create policy "ad-banners: manager update" on storage.objects
    for update to authenticated using (bucket_id = 'ad-banners' and public.has_admin_role('manager'))
    with check (bucket_id = 'ad-banners' and public.has_admin_role('manager'));
  create policy "ad-banners: manager delete" on storage.objects
    for delete to authenticated using (bucket_id = 'ad-banners' and public.has_admin_role('manager'));
  -- 목록 보기 (관리 화면) — 이미지 자체는 공개 주소로 누구나 볼 수 있어요
  create policy "ad-banners: manager read" on storage.objects
    for select to authenticated using (bucket_id = 'ad-banners' and public.has_admin_role('manager'));
exception when insufficient_privilege or undefined_table or undefined_column then
  raise notice 'ad-banners 버킷을 SQL 로 만들지 못했어요 → Supabase → Storage → New bucket: 이름 ad-banners, Public 켜기, 파일 크기 2MB, 형식 image/jpeg · image/png · image/webp. 정책은 CLAUDE.md "광고 배너" 참고';
end $$;
