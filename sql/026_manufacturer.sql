-- ================================================================
-- allAbut — 026: 제조사 표시 (판매 = allAbut, 제조 = BIOPLANT Co., Ltd.) + 세금 문서 품목 이름에 CNC
-- ================================================================
-- 1) company_settings 에 제조사 칸을 더해요. **값은 코드에 쓰지 않아요** — 관리자 Settings → Company info → "제조사"(owner)에서 입력.
--    비어 있는 칸은 화면에 안 보여요.
--      manufacturer_name        제조사 이름 (예: 관리자가 입력하는 "BIOPLANT Co., Ltd.")
--      manufacturer_address     제조사 주소
--      manufacturer_certs       제조사가 보유한 인증 — 한 줄에 하나 (인증 이름 + 번호). allAbut 의 인증처럼 보이게 쓰지 않아요
--      manufacturer_license_no  태국 FDA 의료기기 제조 허가 번호
--      ad_license_no            광고 허가 번호 (있으면 로그인 전 화면 푸터에 한 줄)
--    수정 권한은 기존 규칙 그대로 ("company_settings: admin update" = owner, sql/005). 읽기는 누구나 (회사소개 · 푸터 · 이용약관).
-- 2) 세금계산서 · 영수증의 품목 이름에 CNC: _issue_tax_doc_for_topup 을 **021 정의 그대로 복사**하고 품목 이름 두 줄만 바꿔요.
--    "CNC Custom Abutment credits" / "CNC Custom Abutment + Zirconia Crown Set credits" (태국어 칸도 CNC Custom Abutment).
--    **이미 발행된 문서는 바뀌지 않아요** (문서는 발행 때 그대로 저장 · 고칠 수 없음). 환불 문서(크레딧 노트 · 환불 영수증)는 원래 문서의 품목을 그대로 따라가요.
--
-- 실행 순서: 025 다음. 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.
-- ⚠️ 021 을 다시 실행하면 026 도 다시 (_issue_tax_doc_for_topup 이 CNC 가 없는 품목 이름으로 돌아가서). 제조사 칸 · 값은 021 을 다시 해도 그대로예요.

-- ================================================================
-- 1) 제조사 칸
-- ================================================================
alter table public.company_settings
  add column if not exists manufacturer_name       text not null default '',
  add column if not exists manufacturer_address    text not null default '',
  add column if not exists manufacturer_certs      text not null default '',
  add column if not exists manufacturer_license_no text not null default '',
  add column if not exists ad_license_no           text not null default '';

-- 길이 제한 (화면 입력칸과 같게 — 이상하게 긴 글자가 푸터 · 회사소개를 망가뜨리지 않게)
alter table public.company_settings drop constraint if exists company_settings_manufacturer_len;
alter table public.company_settings add constraint company_settings_manufacturer_len check (
  char_length(manufacturer_name) <= 200 and char_length(manufacturer_address) <= 500 and char_length(manufacturer_certs) <= 2000 and
  char_length(manufacturer_license_no) <= 100 and char_length(ad_license_no) <= 100);

comment on column public.company_settings.manufacturer_name is '제조사 이름 (판매 = allAbut, 제조 = 이 회사). 비면 화면에 안 보임';
comment on column public.company_settings.manufacturer_certs is '제조사가 보유한 인증, 한 줄에 하나 (인증 이름 + 번호). 제조사 것으로만 표기';
comment on column public.company_settings.manufacturer_license_no is '태국 FDA 의료기기 제조 허가 번호';
comment on column public.company_settings.ad_license_no is '광고 허가 번호 (로그인 전 화면 푸터)';


-- ================================================================
-- 2) 세금 문서 품목 이름 (021 정의 그대로 + 품목 이름만 CNC)
-- ================================================================
create or replace function public._issue_tax_doc_for_topup(p_topup text, p_by uuid default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  t public.topup_requests;
  p public.profiles;
  c public.company_settings;
  v_existing bigint;
  v_country text;
  v_type text;
  v_today date := public._bkk_today();
  v_id bigint;
  v_item jsonb;
  v_name_en text;
  v_name_th text;
begin
  select * into t from public.topup_requests where id = p_topup;
  if not found then raise exception 'NOT_FOUND'; end if;
  if t.status <> 'approved' then raise exception 'NOT_APPROVED'; end if;
  select id into v_existing from public.tax_invoices where topup_id = p_topup and doc_type in ('invoice', 'receipt');
  if v_existing is not null then return v_existing; end if;
  select * into p from public.profiles where id = t.user_id;
  select * into c from public.company_settings where id = 1;
  v_country := public._norm_country(coalesce(p.reg_country, p.country));
  if v_country = 'TH' then
    if not public._tax_invoice_ready() then return null; end if;
    v_type := 'invoice';
  else
    if not public._receipt_ready() then return null; end if;
    v_type := 'receipt';
  end if;
  -- 026: 제품 이름에는 항상 CNC (앞으로 발행되는 문서만 — 이미 발행된 문서의 items 는 그대로)
  v_name_en := case when t.product = 'crown_set' then 'CNC Custom Abutment + Zirconia Crown Set credits' else 'CNC Custom Abutment credits' end;
  v_name_th := case when t.product = 'crown_set' then 'เครดิตชุด CNC Custom Abutment + ครอบฟันเซอร์โคเนีย' else 'เครดิต CNC Custom Abutment' end;
  v_item := jsonb_build_object('name_en', v_name_en, 'name_th', case when v_type = 'invoice' then v_name_th else '' end,
                               'qty', t.credits, 'unit_price', t.unit_price, 'amount', t.subtotal, 'product', coalesce(t.product, 'abutment'));
  insert into public.tax_invoices (
    doc_type, number, issue_date, user_id, topup_id, approved_date, payment_date, buyer_country,
    seller_name, seller_name_en, seller_address, seller_address_en, seller_tax_id, seller_branch,
    buyer_name, buyer_address, buyer_tax_id, buyer_branch, buyer_phone,
    items, subtotal, vat_rate, vat_amount, total, mail_status, created_by)
  values (
    v_type, public._next_tax_doc_number(case when v_type = 'invoice' then 'IV' else 'RC' end, v_today), v_today, t.user_id, t.id,
    (coalesce(t.reviewed_at, now()) at time zone 'Asia/Bangkok')::date, (t.created_at at time zone 'Asia/Bangkok')::date, v_country,
    case when v_type = 'invoice' then trim(c.seller_name_th) else coalesce(nullif(trim(c.seller_name_en), ''), trim(c.company_name)) end,
    coalesce(nullif(trim(c.seller_name_en), ''), trim(c.company_name)),
    case when v_type = 'invoice' then trim(c.seller_address_th) else coalesce(nullif(trim(c.seller_address_en), ''), trim(c.address)) end,
    coalesce(nullif(trim(c.seller_address_en), ''), trim(c.address)),
    public._norm_tax_id(c.tax_id), coalesce(c.seller_branch, ''),
    coalesce(nullif(p.doc_name, ''), nullif(p.reg_clinic, ''), p.clinic_name, ''),
    coalesce(nullif(p.doc_address, ''), nullif(p.reg_addr, ''), p.address, ''),
    coalesce(p.tax_id, ''), case when v_country = 'TH' then coalesce(p.doc_branch, '') else '' end,
    coalesce(nullif(p.reg_phone, ''), p.phone, ''),
    jsonb_build_array(v_item), t.subtotal, coalesce(t.vat_rate, case when t.subtotal > 0 then round(t.vat_amount / t.subtotal * 100, 2) else 0 end),
    t.vat_amount, t.total, case when v_type = 'invoice' then 'pending' else 'not_required' end, coalesce(p_by, auth.uid()))
  returning id into v_id;
  perform public._audit('tax_doc_issued', 'tax_invoice', v_id::text,
    jsonb_build_object('type', v_type, 'topup', t.id, 'total', t.total, 'number', (select number from public.tax_invoices where id = v_id)));
  return v_id;
end $$;
revoke all on function public._issue_tax_doc_for_topup(text, uuid) from public, anon, authenticated;
