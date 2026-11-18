-- ================================================================
-- allAbut — 025: 주문번호 날짜를 방콕 날짜로 (CA + YYMMDD + 일련번호)
-- ================================================================
-- 지금까지 주문번호의 날짜(CA261118-0001 의 261118)는 서버 시각(UTC) 기준이라,
-- 방콕 시간 새벽 0시 ~ 7시에 들어온 주문은 "전날" 날짜가 붙었어요. 충전 요청번호(TP…)는 이미 방콕 날짜예요 (sql/021).
-- 이 파일은 create_cnc_order 의 **가장 최신 정의(019 정의 + 023 의 맨 앞 STAFF_ACCOUNT 검사)를 그대로 복사**하고,
-- 주문번호를 만드는 to_char(now(), 'YYMMDD') 한 줄만 to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD') 로 바꿔요.
-- 이미 만들어진 주문번호는 바뀌지 않아요 (일련번호 cnc_order_seq 도 그대로 이어져요).
--
-- 실행 순서: 024 다음. 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.
-- ⚠️ 008 · 012 · 018 · 019 · 023 을 다시 실행하면 025 도 다시 (create_cnc_order 가 UTC 날짜 모양으로 돌아가서)

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
  if exists (select 1 from public.profiles where id = auth.uid() and account_type = 'staff') then raise exception 'STAFF_ACCOUNT'; end if;   -- 023: 직원 계정은 주문 · 충전 불가
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
  v_id := 'CA' || to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD') || '-' || lpad(nextval('public.cnc_order_seq')::text, 4, '0');   -- 025: 방콕 날짜
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
