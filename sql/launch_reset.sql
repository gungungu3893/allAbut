-- ################################################################
-- ##                                                            ##
-- ##   ⚠️  allAbut — 정식 오픈용 테스트 데이터 초기화            ##
-- ##                                                            ##
-- ##   · 되돌릴 수 없어요 (지운 주문 · 크레딧 · 충전 기록은 복구 불가)
-- ##   · 정식 오픈 날 딱 1번만 실행하세요
-- ##   · 실행 전에 반드시 백업 (Supabase → Database → Backups,
-- ##     또는 Table Editor 에서 표마다 Export → CSV)
-- ##   · 일반 SQL 재실행 순서(002 → … → 017)에 넣지 마세요
-- ##                                                            ##
-- ################################################################
--
-- 실행 방법 (자세한 순서는 LAUNCH_CHECKLIST.md)
--   1) 백업을 먼저 받아요
--   2) 아래 do 블록의 확인 문구 줄을 직접 고쳐요:
--        v_confirm text := 'CHANGE-ME';      →      v_confirm text := 'DELETE-ALL-TEST-DATA';
--      (고치지 않으면 아무것도 지우지 않고 오류로 멈춰요)
--   3) 고객 계정까지 지울지 정해요 (기본 false = 계정은 남김):
--        v_delete_customer_accounts boolean := false;
--      true 로 바꾸면 팀원(admins)이 아닌 계정을 auth.users 에서 지워요 (profiles · 지갑도 같이 지워져요).
--      ※ true 로 할 거면 Storage 버킷 3개를 **먼저** 비우세요 (파일 주인 기록 때문에 계정 삭제가 막힐 수 있어요)
--   4) Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run
--   5) 결과 탭의 notice 에서 "지운 줄 수" 표를 확인해요
--
-- 하나의 do 블록 = 하나의 트랜잭션: 중간에 오류가 나면 전부 취소되고 아무것도 안 지워져요.
-- 지울 때는 TRUNCATE 를 써요 → 줄마다 실행되는 트리거(LINE 알림 Database Webhook 포함)가 돌지 않아서 알림이 쏟아지지 않아요.
--
-- 지우는 것 (테스트 데이터, 표가 있을 때만):
--   cnc_orders · invoices · credit_lot_usage · credit_lots · credit_history · topup_requests · refund_cash_lots ·
--   commission_payouts · signup_bonus_grants · clinic_change_requests · account_deletion_requests ·
--   admin_audit_log · site_events · admin_group_link_codes(그룹 연결용 임시 코드)
--   + credit_wallets 는 모든 계정 잔액 0 (018 이후면 크라운 세트 잔액 balance_crown_set 도 0)
--   + 번호 다시 처음부터: 주문번호(cnc_order_seq) · 충전 요청번호(topup_seq) · 각 표의 자동 번호(RESTART IDENTITY)
-- 남기는 것:
--   credit_packages(가격·패키지) · payment_settings(결제 · 이벤트 · 서비스 상태 포함) · company_settings · legal_versions ·
--   admins(팀·역할) · sales_reps · sales_rep_rates · admin_notify_targets(LINE 그룹) · blocked_email_domains ·
--   profiles(계정을 남기면 동의 버전 · 담당 영업 · 치과 정보 · LINE 연결 그대로)
-- service_mode 는 바꾸지 않아요 → 끝나면 관리자 Settings → "서비스 상태" 에서 직접 '정식' 으로
--
-- Storage 파일은 SQL 로 지울 수 없어요 → Supabase → Storage → 버킷마다 ⋯ → Empty bucket
--   cnc-files (고객 스캔 · 사진) · cnc-designs (디자인 파일) · topup-slips (입금 슬립)


do $$
declare
  -- ▼▼▼ 직접 고치는 줄 (2개) ▼▼▼
  v_confirm text := 'CHANGE-ME';                 -- 'DELETE-ALL-TEST-DATA' 로 바꿔야 실행돼요
  v_delete_customer_accounts boolean := false;   -- true = 팀원이 아닌 계정도 삭제
  -- ▲▲▲ 직접 고치는 줄 ▲▲▲

  -- 지울 표 (외래키로 서로 이어진 표는 한 번의 TRUNCATE 로 같이 지워요 — 남기는 표가 이 표들을 가리키면 오류로 멈춰서 안전)
  v_tables text[] := array[
    'invoices', 'credit_lot_usage', 'refund_cash_lots', 'commission_payouts', 'signup_bonus_grants',
    'clinic_change_requests', 'account_deletion_requests', 'credit_history', 'credit_lots',
    'topup_requests', 'cnc_orders', 'admin_audit_log', 'site_events', 'admin_group_link_codes'
  ];
  v_existing text[] := '{}';
  v_t text;
  v_n bigint;
  v_report text := '';
  v_wallets bigint := 0;
  v_profiles bigint := 0;
  v_users bigint := 0;
begin
  if v_confirm is distinct from 'DELETE-ALL-TEST-DATA' then
    raise exception 'launch_reset: 확인 문구가 없어서 멈췄어요. 백업 후 v_confirm 을 ''DELETE-ALL-TEST-DATA'' 로 고쳐서 다시 실행하세요. (아무것도 지우지 않았어요)';
  end if;

  -- 1) 지울 줄 수 세기 (있는 표만)
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null then
      execute format('select count(*) from public.%I', v_t) into v_n;
      v_existing := v_existing || v_t;
      v_report := v_report || format(E'\n  %-28s %s', v_t, v_n);
    else
      v_report := v_report || format(E'\n  %-28s (표 없음 — 건너뜀)', v_t);
    end if;
  end loop;

  -- 2) 테스트 데이터 지우기 + 자동 번호 처음부터
  if array_length(v_existing, 1) > 0 then
    execute 'truncate table ' ||
      (select string_agg(format('public.%I', x), ', ') from unnest(v_existing) x) ||
      ' restart identity';
  end if;

  -- 3) 주문번호 · 충전 요청번호 처음부터 (CA…-0001 · TP…-0001)
  if to_regclass('public.cnc_order_seq') is not null then execute 'alter sequence public.cnc_order_seq restart with 1'; end if;
  if to_regclass('public.topup_seq') is not null then execute 'alter sequence public.topup_seq restart with 1'; end if;

  -- 4) (선택) 팀원이 아닌 고객 계정 삭제 — profiles 를 먼저, 그다음 auth.users
  if v_delete_customer_accounts then
    delete from public.profiles p where not exists (select 1 from public.admins a where a.user_id = p.id);
    get diagnostics v_profiles = row_count;
    delete from auth.users u where not exists (select 1 from public.admins a where a.user_id = u.id);
    get diagnostics v_users = row_count;
  end if;

  -- 5) 남은 계정의 크레딧 잔액 0 (묶음 · 이력은 위에서 지웠어요)
  if to_regclass('public.credit_wallets') is not null then
    update public.credit_wallets set balance = 0, updated_at = now() where balance <> 0;
    get diagnostics v_wallets = row_count;
    -- 크라운 세트 잔액 (sql/018 이후에만 있는 칸)
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'credit_wallets' and column_name = 'balance_crown_set') then
      execute 'update public.credit_wallets set balance_crown_set = 0, updated_at = now() where balance_crown_set <> 0';
    end if;
  end if;

  v_report := v_report
    || format(E'\n  %-28s %s', 'credit_wallets (잔액 → 0)', v_wallets)
    || format(E'\n  %-28s %s', 'profiles (계정 삭제)', case when v_delete_customer_accounts then v_profiles::text else '(안 지움)' end)
    || format(E'\n  %-28s %s', 'auth.users (계정 삭제)', case when v_delete_customer_accounts then v_users::text else '(안 지움)' end);

  raise notice E'launch_reset 완료 — 지운 줄 수:%\n주문번호 · 충전 요청번호 시퀀스: 1 부터 다시\nservice_mode 는 그대로예요 → 관리자 Settings → "서비스 상태" 에서 직접 정식으로 바꾸세요.\nStorage 버킷 3개(cnc-files · cnc-designs · topup-slips)는 Supabase → Storage 에서 Empty bucket 으로 비우세요.', v_report;
end $$;
