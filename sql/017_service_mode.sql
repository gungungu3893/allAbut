-- ================================================================
-- allAbut — 017: 서비스 상태 (테스트 / 정식) — TEST 배지
-- ================================================================
-- payment_settings.service_mode : 'test'(기본) | 'live'
--   'test' 이면 사이트(랜딩 · 로그인 화면 메뉴 줄 · 앱 헤더 로고 옆 "TEST" 배지, 랜딩 슬로건 옆 "Beta test service")와
--   LINE 카드(윗줄 오른쪽 회색 "TEST" 배지)에 표시해요. 'live' 면 아무것도 안 보여요.
--
--   get_service_mode()           누구나(로그인 전 anon 포함) 읽기 → 'test' | 'live'
--   admin_set_service_mode(mode) owner 만 바꾸기 → 작업 기록 'service_mode' (from → to)
--                                (payment_settings 를 고치는 거라 기존 트리거가 'settings_changed' 도 같이 남겨요)
--
-- 정식 오픈 날: sql/launch_reset.sql(테스트 데이터 초기화)을 실행한 뒤 관리자 Settings → "서비스 상태" 에서 직접 '정식' 으로 바꿔요
-- (launch_reset 은 service_mode 를 자동으로 바꾸지 않아요).
--
-- 실행 순서: 016 다음 (005 의 has_admin_role · _audit 필요). 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.


-- ================================================================
-- 1) 칸
-- ================================================================
alter table public.payment_settings add column if not exists service_mode text not null default 'test';
alter table public.payment_settings drop constraint if exists payment_settings_service_mode_check;
alter table public.payment_settings add constraint payment_settings_service_mode_check check (service_mode in ('test', 'live'));


-- ================================================================
-- 2) 읽기 (누구나)
-- ================================================================
create or replace function public.get_service_mode()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select service_mode from public.payment_settings where id = 1), 'test');
$$;
revoke all on function public.get_service_mode() from public;
grant execute on function public.get_service_mode() to anon, authenticated;


-- ================================================================
-- 3) 바꾸기 (owner)
-- ================================================================
create or replace function public.admin_set_service_mode(p_mode text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_mode is null or p_mode not in ('test', 'live') then raise exception 'INVALID_ACTION'; end if;
  select service_mode into v_old from public.payment_settings where id = 1 for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old = p_mode then return p_mode; end if;
  update public.payment_settings set service_mode = p_mode where id = 1;
  perform public._audit('service_mode', 'payment_settings', '1', jsonb_build_object('from', v_old, 'to', p_mode));
  return p_mode;
end $$;
revoke all on function public.admin_set_service_mode(text) from public, anon;
grant execute on function public.admin_set_service_mode(text) to authenticated;
