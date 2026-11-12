-- ================================================================
-- allAbut — 014: 방문 기록 보관 기간 (24개월) 자동 삭제
-- ================================================================
-- 개인정보처리방침 "보유 기간": 방문 통계(site_events)는 최대 24개월 보관 후 삭제.
--
--   purge_old_site_events()   방콕 날짜(day) 기준 24개월보다 오래된 site_events 를 지우고, 지운 줄 수를 돌려줘요
--                             (관리자 화면에서 부르지 않아요 — pg_cron 과 SQL Editor 에서만. 브라우저 권한 없음)
--   pg_cron 'allabut-purge-site-events'   매일 방콕 새벽 1시 30분 = UTC 18:30 ('30 18 * * *')
--     · 기존 예약과 시간이 겹치지 않아요: allabut-expire-credits 18:00, allabut-expiry-reminders 18:05 (sql/002)
--     · pg_cron 이 없으면 오류 없이 건너뛰고 안내(notice)만 출력
--
-- 가입 IP · 기기 ID (profiles.signup_ip / signup_device_id, sql/010) 는 여기서 지우지 않아요
--   (계정이 있는 동안 보관 — 계정 삭제는 지금처럼 Supabase 대시보드에서 수동)
--
-- 실행 순서: 013 다음. 두 번 실행해도 안전 (함수는 create or replace, 예약은 지우고 다시 등록).
-- 기존 SQL 파일은 고치지 않아요.


-- ================================================================
-- 1) 삭제 함수
-- ================================================================
-- 기준: day < (방콕 오늘 - 24개월)
--   예) 방콕 오늘이 2028-11-13 이면 기준일 2026-11-13 → 2026-11-12 까지의 기록을 지우고, 2026-11-13 부터는 남겨요
create or replace function public.purge_old_site_events()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_cutoff date := ((now() at time zone 'Asia/Bangkok')::date - interval '24 months')::date;
  v_n integer;
begin
  delete from public.site_events where day < v_cutoff;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 브라우저(anon · authenticated)는 부를 수 없게 (pg_cron · SQL Editor = postgres 만)
revoke all on function public.purge_old_site_events() from public;
revoke all on function public.purge_old_site_events() from anon, authenticated;


-- ================================================================
-- 2) 예약 작업 (pg_cron) — 방콕 새벽 1시 30분 = UTC 18:30
-- ================================================================
do $$
declare j record;
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron is not enabled — skipping schedule allabut-purge-site-events (visit logs older than 24 months will not be deleted automatically; run select public.purge_old_site_events(); by hand)';
    return;
  end if;
  for j in select jobid from cron.job where jobname = 'allabut-purge-site-events' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('allabut-purge-site-events', '30 18 * * *', 'select public.purge_old_site_events()');
end $$;
