# CNC 커스텀 어버트먼트 주문 기능 — Dentalk → allAbut 이전 계획

> 이 문서는 **분석 보고서**예요. Dentalk 코드는 하나도 고치지 않았고, allAbut 코드도 바꾸지 않았어요.
> 분석 대상: `gungungu3893/Dentalk` 저장소, 브랜치 **`claude/admin-supabase-integration-icvNm`** (마지막 커밋 `f43a9fb`, 2026-04-21)

---

## 0. 먼저 알아두실 점 (중요)

1. **`custom.js`는 기본 브랜치에 없어요.**
   Dentalk의 기본 브랜치(`claude/continue-website-build-1mQmz`)는 3월 버전이라 `custom.js`, `admin.js`, `shop.js`, 언어 파일 9개가 없어요.
   CNC 마법사(5단계), 크레딧, 세금계산서 코드는 모두 **`claude/admin-supabase-integration-icvNm`** 브랜치에 있어서 이 브랜치를 기준으로 분석했어요.
2. **지금 실제로 쓰이는 제출 함수에는 크레딧 차감이 없어요.**
   - 화면의 "Submit Order" 버튼은 `submitWizardOrder()`(5단계 마법사)를 불러요.
   - "치아 1개 = 1크레딧" 차감 코드는 **예전 다중 케이스 폼의 `submitCustom()`에만** 있어요. 이 폼은 지금 화면에 연결되어 있지 않아요.
   - 그래서 현재 Dentalk에서는 **크레딧 없이도 CNC 주문이 접수돼요.** 이전할 때 크레딧 차감을 마법사 제출에 새로 넣어야 해요.
3. **Dentalk는 Supabase Auth를 쓰지 않아요.**
   - Dentalk는 닉네임과 비밀번호로 직접 로그인하고, 모든 요청을 공개 키(anon key)로 보내요.
   - DB 보안 규칙(RLS)이 사실상 "누구나 읽기/쓰기 가능(`using (true)`)"이에요. 그래서 다른 사람의 주문과 크레딧도 고칠 수 있는 상태예요.
   - allAbut은 Supabase Auth(`auth.uid()`)를 쓰니까, **DB 구조와 보안 규칙은 새로 설계해야 해요** (아래 6장 SQL).

---

## 1. 주문 흐름 요약 (사용자가 하는 일)

CNC 페이지(`page-custom`)에는 탭이 3개 있어요: **New Order(새 주문)** / **진행중** / **완료**.

### 새 주문 — 5단계 마법사

| 단계 | 화면 | 사용자가 하는 일 | 다음으로 넘어가는 조건 |
|---|---|---|---|
| **1** | 환자·납기·치아 | 환자 ID 입력(선택, 비우면 "익명"), **Delivery Deadline(납기일)** 달력 선택, FDI 치아 차트(위 17~27, 아래 47~37, 사랑니 제외 28개)에서 치아 여러 개 탭 | 치아 1개 이상 |
| **2** | 임플란트 브랜드·사이즈 | 브랜드 11종 중 1개 선택(선택한 **모든 치아에 똑같이 적용**), 치아별 사이즈를 글자로 입력 | 브랜드 선택 |
| **3** | 쉐이드·메모 | VITA 쉐이드 14종 중 1개 선택(모든 치아 공통), 특별 요청 메모 | 없음 (선택 사항) |
| **4** | 파일 업로드 | STL 같은 3D 파일, 사진, PDF 등 아무 형식이나 최대 10개를 드래그하거나 선택. 파일마다 👁 버튼으로 **미리보기**(3D·이미지·PDF) | 없음 (파일 없어도 진행 가능) |
| **5** | 확인·배송·제출 | 주문 요약 확인, 배송 정보(치과명·주소·연락처·Line ID) 확인·수정(로그인 정보로 미리 채워짐) → **Submit Order** | 치과명·주소·연락처 필수 |

- 위쪽에 **스텝 바(1~5)**가 있어요. 지나간 단계는 ✓, 현재 단계는 강조, 앞으로 할 단계는 회색이에요.
- 제출하면 다음 순서로 진행돼요.
  1. 주문번호를 만들어요(`CA` + 연도 + 월 알파벳 + 일 + 시분, 예: `CA2026K021430`).
  2. 파일을 Storage에 올려요.
  3. 주문을 DB에 저장해요.
  4. 관리자에게 LINE 알림을 보내요.
  5. 완료 토스트를 띄우고 "진행중" 탭으로 이동해요.

### 진행중 탭 (주문 상태별로 사용자가 하는 일)

주문 단계: `submitted(접수)` → `confirmed(확인)` → `design_ready(디자인 확인 요청)` → `approved(승인)` → `milling(가공)` → `shipped(배송)` → `done(완료)`. `design_revision(디자인 수정 중)`은 `design_ready` 자리에 표시돼요.

| 단계 | 사용자 화면 / 할 수 있는 일 |
|---|---|
| submitted | **주문 수정**(배송정보·환자ID·납기·메모) / **주문 삭제** |
| confirmed | "디자인 준비 중" 안내 |
| design_ready | 관리자가 올린 디자인 이미지 확인 → **만족(승인)** 또는 **수정 요청(사유 입력)** |
| design_revision | 수정 요청 내용과 이전 디자인을 흐리게 보여줌 |
| shipped | **수령 완료** 버튼 |
| 공통 | 진행 막대(①~⑦), 케이스·치아 상세, 리뷰 이력 |

### 관리자 쪽 (admin.js — 참고용)
접수 확인 → 디자인 파일 업로드(→ `design_ready`) → 밀링 시작 → 배송(택배사·송장번호 입력) → 고객 수령. 아무 단계로나 직접 바꾸는 기능도 있어요. 단계가 바뀔 때마다 LINE 알림이 가요.

### 세금계산서 / 영수증 (내 주문 → CNC 탭)
- **버튼이 보이는 조건:** 주문이 `approved / milling / shipped / done` 상태일 때 "🧾 계산서 발행" 버튼이 보여요.
- **선택 팝업(`invoiceSelectModal`):** 구매자 Tax ID 입력칸과 **Tax Invoice** / **Receipt** 버튼이 있어요.
- **Tax ID가 비어 있을 때:** Tax Invoice를 누르면 Tax ID 입력 팝업(`taxIdPromptModal`)이 한 번 더 떠요.
- **발행하면:**
  1. `invoices` 테이블에 저장해요.
  2. 사용자와 관리자에게 LINE 알림을 보내요.
  3. 새 창에 인쇄용 계산서를 띄워요. 판매자는 BIO PLANT Co., Ltd., VAT 7%는 가격에 포함된 것으로 계산해요.
- ⚠️ **CNC 주문은 가격 정보가 없어서** 품목 가격 0, 합계 0 THB인 계산서가 만들어져요 (8장 질문 참고).
- **"구매자 정보 수정":**
  - 계산서 팝업 안에는 수정 기능이 없어요.
  - 구매자 이름과 주소는 **주문의 치과명·주소**를 그대로 써요.
  - 그 값은 프로필 수정(`profileEditModal`, 이메일·전화·주소·치과명)이나 주문 수정에서 바꿔요.
  - Tax ID는 가입할 때(`regTaxId`) 받거나, 계산서 팝업에서 그때그때 입력해요.

---

## 2. 관련 파일과 함수 목록

### custom.js — CNC 마법사 (현재 사용 중)
| 함수 / 변수 | 하는 일 |
|---|---|
| `wizardStep`, `wizardData` | 현재 단계 번호, 입력값 보관 (patient, deadline, teethSet, brand, teethSizes, shade, memo, stlFiles) |
| `customTab(tab)` | New/진행중/완료 탭 전환. 목록 탭이면 DB에서 주문 다시 불러옴 |
| `initWizard()` | 마법사 초기화 (치아 차트·브랜드·쉐이드 그리기, 배송정보 미리 채우기) |
| `buildWizToothChart()` | FDI 치아 버튼 28개 HTML 만들기 |
| `wizToggleTooth(num)` | 치아 선택/해제 + 선택 개수 표시 |
| `renderWizBrandGrid()`, `wizSelectBrand(b)` | 브랜드 버튼 그리기 / 선택 |
| `renderWizSizeTable()` | 선택한 치아마다 사이즈 입력칸 |
| `VITA_BG`, `renderWizShadeGrid()`, `wizSelectShade(s)` | 쉐이드 색 표, 버튼 그리기 / 선택 |
| `wizOnStlDragOver/DragLeave/Drop`, `wizOnStlSelect` | 파일 드래그·선택 (최대 10개, 형식 제한 없음) |
| `_wizFileIcon(name)` | 확장자별 아이콘 (🧊🖼📄📝🗜📎) |
| `updateWizStlDropUI()` | 선택한 파일 목록 + 👁 미리보기 버튼 |
| `renderWizSummary()` | 5단계 주문 요약 |
| `renderWizStepBar(step)` | 스텝 바 1~5 그리기 |
| `showWizardStep(step)` | 단계 화면 전환, 이전/다음 버튼 상태 |
| `customWizardNext()`, `customWizardPrev()` | 다음/이전 (단계별 검사) |
| **`submitWizardOrder()`** | **제출: 주문번호 생성 → Storage 업로드(실패하면 base64로 대체) → DB 저장 → 관리자 LINE (크레딧 차감 없음)** |
| `getToothName(num)` | `#16 제1대구치` 같은 치아 이름 |
| `renderCustomOrders()` | 진행중 주문 카드 (진행 막대, 디자인 확인, 수령, 수정·삭제, 이력) |
| `renderDoneOrders()` | 완료 주문 카드 |
| `deleteCustomOrder(id)` | 주문 삭제 (DB DELETE, 크레딧 환불 없음) |
| `editCustomOrder(id)`, `saveEditOrder()`, `closeEditModal()` | 주문 수정 팝업 열기 / 저장(PATCH) / 닫기 |
| `buildFlexMessage(icon,title,fields,note,subtitle)` | LINE Flex 메시지(카드 모양) JSON 만들기 |
| `sendLine(order, stageKey)` | 예전 텍스트 LINE 알림 (지금은 쓰이지 않음) |

### custom.js — 예전 다중 케이스 폼 (화면에 연결 안 됨)
`addCase`, `removeCase`, `buildToothChart`, `toggleTooth`, `renderToothDetails`, `onStlDragOver/Leave/Drop`, `onStl`, **`submitCustom()`** (← 크레딧 확인·차감 로직이 여기에만 있음), `resetCustomForm`.
※ `custom.js` 1004줄 이후(`renderUsed` ~ `forumGallerySlide`)는 **중고마켓·포럼** 코드라 CNC와 무관해요.

### admin.js — 주문 저장·관리자 처리·고객 액션
| 함수 | 하는 일 |
|---|---|
| `saveOrderToSupabase(order)` | 주문 저장 (실패하면 1MB 넘는 base64를 빼고 한 번 더 시도) |
| `loadOrdersFromSupabase()` | 주문 목록 불러와서 `customOrders` 배열로 변환 |
| `updateOrderInSupabase(id, updates)` | 주문 일부 수정 |
| `adminConfirmOrder`, `adminUploadDesign`, `adminStartMilling`, `adminShipOrder`, `adminConfirmShipping`, `adminChangeCustomOrderStage`, `adminReuploadStl` | 관리자 단계 처리 (디자인 파일 → `designs` 버킷) |
| `customerApproveDesign`, `showRejectPanel`, `customerRejectDesign`, `customerReceiveOrder` | 고객 디자인 승인 / 수정 요청 / 수령 완료 |
| `sendLineMessage(to, messages)`, `sendLineRaw(to, text)` | LINE Worker로 메시지 보내기 |
| `isAdmin()` | 관리자 여부 (`currentUser.role === 'admin'`) |
| `openCreditChargeModal`, `chargeCredits`, `openCreditAdjustModal`, `adjustCredits` | 관리자 크레딧 충전 / 직접 조정 |

### supabase.js — DB/Storage 호출
| 함수 | 하는 일 |
|---|---|
| `sbHeaders`, `sbGet`, `sbGetWithCount`, `sbPost`, `sbPatch`, `sbDelete` | REST API 기본 함수 (anon key 사용) |
| `sbSaveCustomOrder(order, cases)` | `custom_orders` INSERT |
| `sbGetCustomOrders(nick, isAdmin, page)` | `custom_orders` SELECT (20개씩, `date` 내림차순, 일반 사용자는 `user_nickname` 필터) |
| `sbUpdateCustomOrder(id, updates)` | `custom_orders` PATCH (stage, design_versions, review_history, carrier, tracking_number, cases) |
| `sbGetUserCredits(nick)` | `licenses.credits` 읽기 |
| `sbUseCredits(nick, n, desc)` | 크레딧 차감 (읽기 → 계산 → PATCH → `credit_history` 기록) |
| `sbAddCredits`, `sbSetCredits` | 크레딧 충전 / 덮어쓰기 + 이력 |
| `sbGetCreditHistory`, `sbGetAllCreditHistory` | 크레딧 이력 조회 |
| `sbSaveInvoice`, `sbGetUserInvoices`, `sbDeleteExpiredInvoices` | 계산서 저장 / 조회 / 30일 지난 것 삭제 |
| (직접 fetch) `POST /storage/v1/object/stl-file/{파일명}` | STL 업로드 — `submitWizardOrder`, `submitCustom`, `adminReuploadStl` 안에 직접 작성 |

### shop.js — 세금계산서 / 영수증
`SELLER_INFO`(판매자 정보), `_genInvoiceId(prefix)`(INV/REC-날짜-랜덤4자리), `openInvoiceSelect(order)`, `generateTaxInvoice()`, `confirmTaxIdAndGenerate()`, `generateReceipt()`, `openInvoicePrint(inv)`(인쇄용 새 창), `renderMyInvoices()`(내 계산서 목록)

### app.js — 공통 함수 / 상수 / 내 주문
| 이름 | 하는 일 |
|---|---|
| `escHtml(str)` | HTML 특수문자 이스케이프 (XSS 방지) |
| `showToast(msg, type)` | 위쪽 알림 토스트 |
| `openModal(id)`, `closeModal(id)` | `.open` 클래스로 팝업 열기/닫기 |
| `dtLoaderHtml(text)` | 로딩 스피너 HTML |
| `IMPLANT_BRANDS`, `TOOTH_COLORS`, `ORDER_STAGES` | 브랜드 11종, VITA 14색, 주문 단계 7개 |
| `LINE_PROXY_URL`, `LINE_USER_ID` | LINE Worker 주소, 관리자 LINE ID |
| `LINE_MSGS`, `getLineMsg`, `getLineUserInfo`, `sendLineMsg`, `sendLineAdminMsg` | 다국어 LINE 메시지 (사용자 언어로 `/push`) |
| `sendStatusChangeNotification` | 단계 변경 알림 (관리자 쪽에서 사용) |
| `renderMyOrdersDetailCnc()` | 내 주문(CNC) + 계산서 버튼 |
| `renderMyCreditHistory()` | 내 크레딧 잔액 + 이력 |
| `openProfileEdit()`, `saveProfile()` | 프로필(이메일·전화·주소·치과명) 수정 = 배송/구매자 정보 |

### lang.js — 번역
`t(key)` (현재 언어 → 영어 → key 순으로 찾음), `tf(key, ...)` (문장 속 `%`를 차례로 바꿈). 언어 파일: `lang-en/ko/th/zh/vi/es/tr/ar/fa.js` (9개).

### index.html
- **화면:** `#page-custom`(탭, 스텝 바 `#wizStepBar`, `#wiz-step-1`~`5`, 납기 `#wiz-deadline`, 파일 드롭 `#wiz-stl-drop`, 배송 `#cust-*`), `#editOrderModal`(주문 수정), `#shippingModal`(관리자 배송), `#stlViewerModal`(파일 뷰어), `#invoiceSelectModal`, `#taxIdPromptModal`, `#profileEditModal`
- **인라인 스크립트 (STL 3D 뷰어):** `openFileViewer`, `openStlViewer`, `openFileViewerFromFile`, `closeStlViewer`, `_initStlScene`, `_loadStlBuffer`, `_parseBinaryStl`, `_parseAsciiStl`, `_showStlGeometry`
  - 회전은 마우스·터치 드래그, 줌은 휠이에요.
  - STLLoader 없이 STL을 직접 해석해서 골드 메시로 보여 줘요.

### cloudflare-worker.js — LINE 중계
`POST /` 또는 `POST /push`(받은 `{to, messages}`를 LINE Push API로 그대로 전달), `POST /webhook`(LINE 친구추가 시 `licenses.line_user_id` 자동 연결).

### CNC에서 쓰는 번역 키 (코드에서 자동 추출, 142개 — 9개 언어 모두 존재)
`add_more, anon_patient, brand_ph, case_deadline_label, case_detail, case_label, case_nr, case_patient_ph, case_remove, case_tooth_hint, cases_unit, cnc_date_ph, color_ph, confirm_delete_order, credit_check_error, credit_insufficient_msg, credit_remaining, credit_used, custom_addr_ph, custom_clinic_ph, custom_empty, custom_line_ph, custom_phone_ph, custom_submit, custom_submit_note, custom_tab_done, custom_tab_list, custom_tab_new, delete_order_btn, design_not_satisfied, design_reject_ph, design_reject_submit, design_review_title, design_revision_pending, design_satisfied, design_waiting, doc_receipt, doc_tax_invoice, done_cases_teeth_fmt, done_orders_empty, done_status_label, drag_more_files, edit_order_btn, edit_order_title, err_add_case, err_fill_delivery, err_fill_tooth, err_network, err_select_tooth, files_selected_fmt, files_unit, help_btn, inv_buyer_taxid, inv_days, inv_download, inv_expires, inv_issue_btn, inv_issue_error, inv_issued_ok, inv_load_error, inv_no_invoices, inv_print, inv_select_desc, inv_select_title, inv_skip, inv_subtotal, inv_taxid_hint, jaw_border, line_deadline, line_memo, line_total_cases, lower, lower_jaw, ma_no_orders, memo_ph, no_tooth_info, order_success_line, order_success_msg, patient_label, pe_save, profile_login_msg, receive_btn, review_history_label, sel_count_suffix, selected_teeth, shipped_msg, size_ph, stage_submitted, stage_confirmed, stage_design_ready, stage_design_revision, stage_approved, stage_milling, stage_shipped, stage_done, status_label, stl_download, stl_hint, stl_label, stl_load_error, stl_loading, stl_parse_error, stl_unsupported, stl_viewer_3d, stl_viewer_file, stl_viewer_hint, stl_viewer_image, stl_viewer_pdf, tax_id_cancel, tax_id_confirm, tax_id_placeholder, tax_id_prompt, tax_id_required, teeth_colon_label, teeth_count, teeth_total_prefix, tooth_11 ~ tooth_17, upper, upper_jaw, wiz_brand_all_hint, wiz_confirm_title, wiz_delivery_label, wiz_next, wiz_no_brand_err, wiz_no_tooth_err, wiz_patient_label, wiz_prev, wiz_shade_label, wiz_size_for_tooth, wiz_size_table_title, wiz_stl_all_formats, wiz_stl_formats_hint, wiz_stl_main_label, wiz_teeth_selected` + 크레딧 화면용 `credit_balance, credit_unit, credit_history_title, credit_no_history, credit_type_charge, credit_type_use, credit_load_error`
※ `wiz_step1`~`wiz_step5`(스텝 바 이름)도 필요해요. 이 키들은 `t()` 호출 대신 배열(`_wizStepLabels`)로 불러서 자동 추출에서 빠졌어요.

---

## 3. Dentalk가 실제로 읽고 쓰는 Supabase 테이블 · 컬럼 · Storage

| 대상 | 컬럼 / 경로 | 읽기·쓰기 | 쓰는 곳 |
|---|---|---|---|
| **`custom_orders`** | `id`(text, 주문번호), `user_nickname`, `clinic`, `addr`, `phone`, `line_id`, `cases`(jsonb), `stage`, `design_versions`(jsonb), `review_history`(jsonb), `carrier`, `tracking_number`, `date`(text, 화면용 날짜), `created_at` | INSERT / SELECT / PATCH / DELETE | supabase.js, custom.js, admin.js |
| **`licenses`** | `nickname`, `credits`(int), `clinic_name`, `address`, `phone`, `email`, `line_user_id`, `lang`, `role`, `tax_id`, `license_number` | 크레딧 읽기·PATCH, LINE ID·언어 읽기, 프로필 PATCH | supabase.js, app.js, auth.js, worker |
| **`credit_history`** | `id`, `user_id`(**닉네임** text), `amount`(양수), `type`(`charge`/`use`/`adjust`), `description`, `created_at` | INSERT / SELECT | supabase.js |
| **`invoices`** | `id`, `order_id`, `user_nickname`, `type`(`tax_invoice`/`receipt`), `clinic_name`, `clinic_address`, `clinic_tax_id`, `items`(jsonb), `subtotal`, `vat_amount`, `total_amount`, `issued_date`, `expires_at`(30일), `created_at` | INSERT / SELECT / DELETE(만료) | supabase.js, shop.js |
| Storage **`stl-file`** (공개) | `{주문번호}_case{n}_{k}_{시각}.{확장자}` | 업로드(anon key, `x-upsert`) / 공개 URL로 읽기 | custom.js, admin.js |
| Storage **`designs`** (공개) | `{주문번호}_v{버전}_{시각}.{확장자}` | 관리자 업로드 / 공개 URL | admin.js |

`cases` jsonb 안의 구조 (allAbut도 이 모양을 그대로 쓰면 편해요):
```json
[{
  "patient": "P001",
  "deadline": "2026-11-20",
  "memo": "margin 0.5mm",
  "teeth": [{ "tooth": 16, "toothName": "#16 First Molar", "brand": "Osstem TS", "size": "4.5x10", "color": "A2" }],
  "stls": ["upper.stl", "scanbody.stl"],
  "stlUrls": ["https://.../stl-file/....stl", "..."]
}]
```
`design_versions`: `[{ url, date, name }]`, `review_history`: `[{ action: 'approved'|'rejected', note, date }]`

---

## 4. 외부 의존성

| 항목 | 내용 | allAbut 상황 |
|---|---|---|
| Tailwind CSS | `cdn.tailwindcss.com` (CNC 화면 전체가 Tailwind 클래스, **밝은 테마**) | allAbut도 Tailwind CDN을 불러오지만 **다크 테마**라 디자인을 바꿔야 해요 |
| Three.js | `three@0.160.0/build/three.min.js` (STL 뷰어 전용, STLLoader 없이 직접 해석) | allAbut은 2D(Phaser)로 바꾸면서 Three.js를 뺐어요 → **뷰어를 열 때만 불러오는 방식** 추천 |
| Chart.js | `chart.js@4` | 관리자 통계 전용, CNC에는 필요 없음 |
| Supabase | Dentalk 전용 프로젝트 (REST 직접 호출, anon key) | allAbut은 **다른 프로젝트**이고 `supabase-js` + Auth 사용 |
| LINE Worker | `https://dentalk-line.gungungu.workers.dev` (`/`, `/push`, `/webhook`) | allAbut용으로 새로 만들거나 Supabase Edge Function으로 대체 (보안 문제는 8장) |
| LINE 관리자 ID | `app.js`의 `LINE_USER_ID` 상수 (코드에 고정) | 설정 파일 또는 DB로 옮기기 |
| Google Analytics | `gtag` (ID가 `G-XXXXXXXXXX`로 비어 있음) | 필요 없음 |

---

## 5. allAbut으로 옮길 때: 그대로 / 고쳐서 / 빼기

allAbut 체험관 데스크 5개가 마법사 5단계와 거의 맞아떨어져요.

| allAbut 데스크 | Dentalk 단계 |
|---|---|
| 01 RECEPTION (Mina) | 1단계 앞부분: 환자 ID, 납기일, (배송 정보 미리 확인) |
| 02 TOOTH MAP (Ken) | 1단계 치아 차트 |
| 03 DESIGN LAB (Sora) | 2~3단계: 브랜드, 치아별 사이즈, 쉐이드, 메모 |
| 04 SCAN DATA (Leo) | 4단계: 파일 업로드 + 3D 미리보기 |
| 05 CHECKOUT (Nara) | 5단계: 요약, 배송 정보, **크레딧 확인·차감**, 제출, 계산서 |

### ✅ 거의 그대로 쓸 수 있는 것
- **데이터:** `wizardData` 구조, `cases` jsonb 구조, `ORDER_STAGES`, `TOOTH_COLORS` + `VITA_BG`(쉐이드 색), `IMPLANT_BRANDS`(단, `'기타'` → `'Other'`)
- **치아:** `buildWizToothChart`(FDI 버튼 배치), `getToothName`
- **화면 로직:** `renderWizStepBar`(스텝 바 계산), 단계별 검사 규칙(`customWizardNext`)
- **파일 뷰어:** `_wizFileIcon`, STL 해석 함수 `_parseBinaryStl` / `_parseAsciiStl` / `_showStlGeometry`. Three.js가 필요하고, 뷰어 HTML만 다크 테마로 바꾸면 돼요.
- **알림·계산서:** `buildFlexMessage`(LINE 카드 모양), `openInvoicePrint`(인쇄용 계산서 HTML, `SELLER_INFO` 포함)
- **공통 함수:** `escHtml`, `showToast`, `openModal` / `closeModal`, `tf()` (allAbut `lang.js`에는 `t()`만 있어서 **`tf()`를 추가해야 해요**)
- **번역:** 위 번역 키 142개 + `wiz_step1~5` (우선 `en`, `ko`만 가져오면 돼요)

### 🔧 고쳐서 써야 하는 것
| 무엇 | 왜 / 어떻게 |
|---|---|
| **주문 제출** | 크레딧 확인 → 주문 저장 → 차감을 **DB 함수 하나(트랜잭션)**로 처리. 지금은 브라우저에서 "읽기 → 빼기 → 쓰기"라 두 번 누르면 꼬이고, 차감이 실패해도 주문이 그대로 남아요 |
| **로그인 사용자 정보** | `currentUser.nickname / clinicName / address / phone` → allAbut `profiles` (+ 새 컬럼) + `auth.uid()` |
| **DB 호출** | `fetch` + anon key → `supabase-js`(`window.sb`) 로그인 세션으로 |
| **파일 업로드** | 공개 버킷 + base64 대체 → **비공개 버킷 + 서명 URL(signedUrl)**, 실패하면 base64로 넣지 말고 에러 표시. 파일 크기·형식 제한 추가 |
| **주문번호** | 같은 분(minute)에 두 건이면 충돌해서 저장 실패 → DB에서 순번으로 생성 |
| **날짜** | `date`에 `toLocaleDateString()` 문자열을 저장해서 정렬이 틀려요 → `created_at`으로 정렬, `deadline`은 `date` 타입 |
| **화면 출력** | 치과명·환자ID·사이즈·메모·파일명이 `escHtml` 없이 HTML에 들어가요 (XSS 위험) → 전부 이스케이프 |
| **하드코딩 문구** | LINE 메시지가 태국어로 고정, `confirm('제품을 수령하셨습니까?')`·`'수정 요청사항을 입력해주세요.'` 같은 한국어가 고정 → `t()`로 |
| **주문 목록** | 20개만 불러오고 다음 페이지가 없어요 → 페이지 넘김 또는 "더 보기" |
| **고객 액션** | 승인 / 수정 요청 / 수령 / 수정 / 취소를 브라우저에서 바로 PATCH → **DB 함수(RPC)**로 (상태가 맞을 때만 허용) |
| **CNC 계산서** | 품목 이름이 `(c.teeth||[]).join(',')`라서 `[object Object]`로 나와요 (치아가 객체라서) + 금액 0 THB → 가격 정책 확정 후 수정 |
| **디자인** | 밝은 Tailwind 화면 → allAbut 다크 + 골드, 게임 데스크 대화창 안에서 열리는 패널 형태 |
| **LINE 알림** | 브라우저에서 Worker로 아무 메시지나 보내는 구조 → 서버(Edge Function / DB 트리거)에서 정해진 메시지만 |

### ❌ 빼야 하는 것
- 예전 다중 케이스 폼 전체: `addCase` ~ `submitCustom` (크레딧 규칙만 참고)
- `custom.js` 뒤쪽의 중고마켓·포럼 코드, `sendLine()`(쓰이지 않는 텍스트 알림)
- `licenses` 테이블, 닉네임 기반 신원 확인, `localStorage` 프로필 저장
- base64 파일 대체 저장, `saveOrderToSupabase`의 "용량 줄여서 다시 저장" 로직
- 계산서 30일 자동 삭제(`expires_at`, `sbDeleteExpiredInvoices`): 세금 서류는 보관해야 해요 (8장 질문)
- Worker 코드 안에 들어 있는 LINE 토큰 기본값(`FALLBACK_LINE_TOKEN`)
- Google Analytics 태그, Chart.js(CNC와 무관)

---

## 6. allAbut Supabase에 필요한 SQL

> **실행 방법:**
> 1. Supabase 대시보드에서 **SQL Editor → New query**를 여세요.
> 2. 아래 SQL을 **한 번에** 붙여넣고 **Run**을 누르세요.
>
> - `profiles` 테이블은 이미 있다고 보고, 거기에 연결했어요 (`profiles.id` = 로그인 사용자 id).
> - **설계 원칙:** "로그인한 사용자는 자기 주문만 읽기/쓰기"
>   - **읽기**는 RLS 정책으로 막아요 (자기 것 + 관리자).
>   - **쓰기**는 돈(크레딧)이 걸려 있어서, 테이블에 직접 쓰는 것을 막고 **자기 주문만 다룰 수 있는 DB 함수(RPC)**로만 허용해요. 직접 INSERT를 열어 두면 크레딧을 내지 않고 주문을 만들 수 있기 때문이에요.
> - 관리자는 `admins` 테이블에 등록된 사람만이에요. 일반 사용자는 이 테이블을 읽거나 쓸 수 없어서 스스로 관리자가 될 수 없어요.
>
> ✅ **검증:** 로컬 PostgreSQL 16에 Supabase와 같은 구조(`auth.uid()`, `storage`, `anon`/`authenticated` 역할)를 흉내 내서 이 SQL을 실행했어요. 두 번 실행해도 오류가 없고, 18개 시나리오가 모두 의도대로 동작했어요.
> - 크레딧 부족이면 주문 거부, 주문하면 잔액이 정확히 차감돼요.
> - 직접 INSERT로 크레딧을 우회하거나, 스스로 충전하거나, 관리자로 등록하는 시도는 모두 막혀요.
> - 다른 사람의 주문·계산서·파일은 보이지 않고 수정할 수도 없어요.
> - 취소하면 크레딧이 환불돼요. 상태가 맞지 않는 승인·수령·취소는 거부돼요.
> - 로그인하지 않은 상태(anon)에서는 함수를 실행할 수 없어요.
>
> (실제 Supabase 프로젝트에서는 아직 실행하지 않았어요.)

```sql
-- ================================================================
-- allAbut CNC 주문 기능 — 테이블 · 보안 규칙(RLS) · DB 함수 · Storage
-- ================================================================

-- 0) 배송/구매자 정보를 profiles 에 추가 (사용자가 자기 프로필에서 수정)
alter table public.profiles
  add column if not exists clinic_name  text,
  add column if not exists address      text,
  add column if not exists phone        text,
  add column if not exists tax_id       text,
  add column if not exists line_user_id text,
  add column if not exists lang         text default 'en';

-- 1) 관리자 목록 (정책 없음 → 일반 사용자는 읽기/쓰기 불가. SQL Editor 에서만 추가)
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 2) 크레딧 지갑 (잔액) — 사용자는 읽기만, 변경은 DB 함수로만
create table if not exists public.credit_wallets (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
alter table public.credit_wallets enable row level security;
drop policy if exists "wallet: read own" on public.credit_wallets;
create policy "wallet: read own" on public.credit_wallets
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- 3) 크레딧 이력 (amount: 충전 +, 사용 -)
create table if not exists public.credit_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      integer not null,
  type        text not null check (type in ('charge', 'use', 'refund', 'adjust')),
  order_id    text,
  description text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_credit_history_user on public.credit_history (user_id, created_at desc);
alter table public.credit_history enable row level security;
drop policy if exists "credit_history: read own" on public.credit_history;
create policy "credit_history: read own" on public.credit_history
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- 4) CNC 주문
create sequence if not exists public.cnc_order_seq;

create table if not exists public.cnc_orders (
  id              text primary key,                                   -- 예) CA261102-0001
  user_id         uuid not null references public.profiles(id) on delete cascade,
  patient         text not null default '',
  deadline        date,
  clinic          text not null,
  addr            text not null,
  phone           text not null,
  line_id         text not null default '',
  cases           jsonb not null default '[]',                        -- Dentalk 과 같은 구조
  teeth_count     integer not null default 0,
  credits_used    integer not null default 0,
  stage           text not null default 'submitted' check (stage in
                  ('submitted','confirmed','design_ready','design_revision','approved','milling','shipped','done','cancelled')),
  design_versions jsonb not null default '[]',
  review_history  jsonb not null default '[]',
  carrier         text,
  tracking_number text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_cnc_orders_user on public.cnc_orders (user_id, created_at desc);
alter table public.cnc_orders enable row level security;

drop policy if exists "cnc_orders: read own"     on public.cnc_orders;
drop policy if exists "cnc_orders: admin update" on public.cnc_orders;
drop policy if exists "cnc_orders: admin delete" on public.cnc_orders;
create policy "cnc_orders: read own" on public.cnc_orders
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "cnc_orders: admin update" on public.cnc_orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cnc_orders: admin delete" on public.cnc_orders
  for delete to authenticated using (public.is_admin());
-- 사용자의 쓰기(주문·수정·취소·승인·수령)는 아래 DB 함수로만 → 자기 주문만, 상태가 맞을 때만

-- 5) 세금계산서 / 영수증 (자동 삭제 없음)
create table if not exists public.invoices (
  id             text primary key,                                    -- INV-YYYYMMDD-XXXX / REC-...
  order_id       text not null references public.cnc_orders(id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type           text not null check (type in ('tax_invoice', 'receipt')),
  buyer_name     text not null default '',
  buyer_address  text not null default '',
  buyer_tax_id   text not null default '',
  items          jsonb not null default '[]',
  subtotal       numeric(12,2) not null default 0,
  vat_amount     numeric(12,2) not null default 0,
  total_amount   numeric(12,2) not null default 0,
  issued_at      timestamptz not null default now()
);
create index if not exists idx_invoices_user on public.invoices (user_id, issued_at desc);
alter table public.invoices enable row level security;
drop policy if exists "invoices: read own"   on public.invoices;
drop policy if exists "invoices: insert own" on public.invoices;
create policy "invoices: read own" on public.invoices
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "invoices: insert own" on public.invoices
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.cnc_orders o where o.id = order_id and o.user_id = auth.uid())
  );


-- ================================================================
-- DB 함수 (RPC) — 앱에서 sb.rpc('함수이름', { ... }) 로 불러요
-- ================================================================

-- 주문 만들기 + 크레딧 차감 (치아 1개 = 1크레딧, 한 번에 처리)
create or replace function public.create_cnc_order(
  p_patient text, p_deadline date, p_clinic text, p_addr text,
  p_phone text, p_line_id text, p_cases jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_teeth integer;
  v_balance integer;
  v_id text;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  if coalesce(trim(p_clinic), '') = '' or coalesce(trim(p_addr), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'DELIVERY_REQUIRED';
  end if;

  select coalesce(sum(jsonb_array_length(coalesce(c -> 'teeth', '[]'::jsonb))), 0)
    into v_teeth from jsonb_array_elements(coalesce(p_cases, '[]'::jsonb)) c;
  if v_teeth < 1 then raise exception 'NO_TEETH'; end if;

  select balance into v_balance from public.credit_wallets where user_id = v_uid for update;
  if v_balance is null or v_balance < v_teeth then raise exception 'INSUFFICIENT_CREDITS'; end if;

  v_id := 'CA' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.cnc_order_seq')::text, 4, '0');

  update public.credit_wallets set balance = balance - v_teeth, updated_at = now() where user_id = v_uid;
  insert into public.cnc_orders (id, user_id, patient, deadline, clinic, addr, phone, line_id, cases, teeth_count, credits_used)
  values (v_id, v_uid, coalesce(p_patient, ''), p_deadline, p_clinic, p_addr, p_phone, coalesce(p_line_id, ''), p_cases, v_teeth, v_teeth);
  insert into public.credit_history (user_id, amount, type, order_id, description)
  values (v_uid, -v_teeth, 'use', v_id, 'CNC order ' || v_id || ' (' || v_teeth || ' teeth)');

  return jsonb_build_object('id', v_id, 'teeth', v_teeth, 'balance', v_balance - v_teeth);
end $$;

-- 접수(submitted) 상태일 때만 배송 정보·환자·납기 수정
create or replace function public.update_my_cnc_order(
  p_id text, p_patient text, p_deadline date, p_clinic text, p_addr text, p_phone text, p_line_id text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.cnc_orders
     set patient = coalesce(p_patient, patient), deadline = p_deadline,
         clinic = coalesce(nullif(trim(p_clinic), ''), clinic),
         addr = coalesce(nullif(trim(p_addr), ''), addr),
         phone = coalesce(nullif(trim(p_phone), ''), phone),
         line_id = coalesce(p_line_id, ''), updated_at = now()
   where id = p_id and user_id = auth.uid() and stage = 'submitted';
  if not found then raise exception 'NOT_EDITABLE'; end if;
end $$;

-- 접수(submitted) 상태일 때만 취소 + 크레딧 환불
create or replace function public.cancel_my_cnc_order(p_id text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_credits integer; v_balance integer;
begin
  update public.cnc_orders set stage = 'cancelled', updated_at = now()
   where id = p_id and user_id = auth.uid() and stage = 'submitted'
   returning credits_used into v_credits;
  if not found then raise exception 'NOT_CANCELLABLE'; end if;
  insert into public.credit_wallets (user_id, balance) values (auth.uid(), 0) on conflict (user_id) do nothing;
  update public.credit_wallets set balance = balance + v_credits, updated_at = now()
   where user_id = auth.uid() returning balance into v_balance;
  insert into public.credit_history (user_id, amount, type, order_id, description)
  values (auth.uid(), v_credits, 'refund', p_id, 'Cancel ' || p_id);
  return v_balance;
end $$;

-- 고객 액션: 디자인 승인 / 수정 요청 / 수령 완료 (상태가 맞을 때만)
create or replace function public.customer_cnc_action(p_id text, p_action text, p_note text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare v_stage text; v_new text; v_action text;
begin
  select stage into v_stage from public.cnc_orders where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_action = 'approve' and v_stage = 'design_ready' then v_new := 'approved'; v_action := 'approved';
  elsif p_action = 'reject' and v_stage = 'design_ready' then
    if coalesce(trim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;
    v_new := 'design_revision'; v_action := 'rejected';
  elsif p_action = 'receive' and v_stage = 'shipped' then v_new := 'done'; v_action := 'received';
  else raise exception 'INVALID_ACTION';
  end if;

  update public.cnc_orders
     set stage = v_new, updated_at = now(),
         review_history = review_history || jsonb_build_array(
           jsonb_build_object('action', v_action, 'note', coalesce(p_note, ''), 'date', now()))
   where id = p_id;
  return v_new;
end $$;

-- 관리자: 크레딧 충전 (+) / 조정 (-) — admins 에 등록된 사람만
create or replace function public.admin_add_credits(p_user uuid, p_amount integer, p_description text default '')
returns integer
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  update public.credit_wallets set balance = balance + p_amount, updated_at = now()
   where user_id = p_user returning balance into v_balance;   -- 0 보다 작아지면 check 제약으로 실패
  insert into public.credit_history (user_id, amount, type, description)
  values (p_user, p_amount, case when p_amount >= 0 then 'charge' else 'adjust' end, coalesce(p_description, ''));
  return v_balance;
end $$;

-- 함수 실행 권한: 로그인한 사용자만 (공개 anon 은 불가)
revoke all on function public.create_cnc_order(text, date, text, text, text, text, jsonb) from public, anon;
revoke all on function public.update_my_cnc_order(text, text, date, text, text, text, text) from public, anon;
revoke all on function public.cancel_my_cnc_order(text) from public, anon;
revoke all on function public.customer_cnc_action(text, text, text) from public, anon;
revoke all on function public.admin_add_credits(uuid, integer, text) from public, anon;
grant execute on function public.create_cnc_order(text, date, text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_my_cnc_order(text, text, date, text, text, text, text) to authenticated;
grant execute on function public.cancel_my_cnc_order(text) to authenticated;
grant execute on function public.customer_cnc_action(text, text, text) to authenticated;
grant execute on function public.admin_add_credits(uuid, integer, text) to authenticated;


-- ================================================================
-- Storage 버킷 (비공개) — 파일 경로 규칙: {user_id}/{업로드묶음id}/{파일명}
-- ================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('cnc-files', 'cnc-files', false, 52428800)          -- 고객 STL·사진·PDF (파일당 50MB)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('cnc-designs', 'cnc-designs', false, 52428800)      -- 관리자 디자인 파일
on conflict (id) do nothing;

drop policy if exists "cnc-files: upload own"  on storage.objects;
drop policy if exists "cnc-files: read own"    on storage.objects;
drop policy if exists "cnc-files: admin all"   on storage.objects;
drop policy if exists "cnc-designs: read own"  on storage.objects;
drop policy if exists "cnc-designs: admin all" on storage.objects;

create policy "cnc-files: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cnc-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cnc-files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'cnc-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cnc-files: admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'cnc-files' and public.is_admin())
  with check (bucket_id = 'cnc-files' and public.is_admin());

-- 디자인 파일: 관리자가 {고객 user_id}/{주문번호}/파일 로 올리면 그 고객만 볼 수 있어요
create policy "cnc-designs: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'cnc-designs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cnc-designs: admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'cnc-designs' and public.is_admin())
  with check (bucket_id = 'cnc-designs' and public.is_admin());

-- ================================================================
-- (관리자 등록) 본인 계정을 관리자로: Authentication → Users 에서 내 UID 를 복사해서
-- insert into public.admins (user_id) values ('여기에-내-UID');
-- ================================================================
```

### 앱에서 쓰는 방법 (미리보기)
```javascript
// 주문 제출 (05 CHECKOUT 데스크)
var res = await sb.rpc('create_cnc_order', {
  p_patient: 'P001', p_deadline: '2026-11-20', p_clinic: '...', p_addr: '...',
  p_phone: '...', p_line_id: '', p_cases: cases
});
// res.error.message 가 'INSUFFICIENT_CREDITS' 면 → 크레딧 부족 안내

// 파일 업로드 (04 SCAN DATA 데스크) — 주문 전에 올리고, 경로를 cases[0].stlUrls 에 넣어요
var path = user.id + '/' + uploadId + '/' + file.name;
await sb.storage.from('cnc-files').upload(path, file);
// 볼 때: sb.storage.from('cnc-files').createSignedUrl(path, 3600)
```

---

## 7. 추천 이전 순서

1. 위 SQL을 실행하고, 내 계정을 `admins`에 넣고, 테스트용 크레딧을 충전해요 (`admin_add_credits`).
2. `lang.js`에 `tf()`를 추가하고, CNC 번역 키(en, ko)를 가져와요.
3. `cnc/` 폴더에 주문 데이터와 함수를 만들어요 (`wizardData`, 치아·브랜드·쉐이드, 검사 규칙).
4. 데스크마다 패널을 열어요. 게임의 대화창 "Start Order" → 데스크별 입력 패널(다크 테마)로 이어져요.
   - 01 RECEPTION: 환자 ID, 납기일
   - 02 TOOTH MAP: 치아 차트
   - 03 DESIGN LAB: 브랜드, 사이즈, 쉐이드, 메모
   - 04 SCAN DATA: 파일 업로드 + 3D 뷰어
   - 05 CHECKOUT: 요약, 배송, 크레딧, 제출
   - 데스크를 마칠 때마다 `completeDesk()`를 불러서 화살표가 다음 데스크로 넘어가게 해요.
5. 주문 목록 / 진행 상태 / 디자인 승인 / 수령 화면을 만들어요.
6. 세금계산서·영수증은 가격 정책이 정해진 뒤에 만들어요.
7. LINE 알림은 서버 쪽(Edge Function)에서 보내도록 만들어요.
8. 관리자 화면을 만들어요 (단계 변경, 디자인 업로드, 배송 입력, 크레딧 충전).

---

## 8. 예상 문제점 · 확인이 필요한 질문

### 발견한 문제점 (Dentalk 현재 코드)
1. **크레딧 차감 누락:** 실제로 쓰는 `submitWizardOrder()`에는 크레딧 확인·차감이 없어요 (예전 폼 `submitCustom()`에만 있음).
2. **크레딧 동시성:** 차감을 브라우저에서 "읽기 → 계산 → 쓰기"로 해요. 동시에 두 번 제출하면 한 번만 빠질 수 있어요. 또 차감이 주문 저장 **뒤**에 일어나서, 차감이 실패해도 주문은 남아요.
3. **보안:** 모든 테이블 RLS가 사실상 열려 있어서, anon key만 있으면 누구나 다른 사람의 주문·크레딧(`licenses.credits`)을 읽고 고칠 수 있어요.
4. **LINE Worker:** `/push`가 받은 대상(`to`)과 내용을 확인 없이 그대로 보내서, 주소를 아는 사람은 누구에게나 메시지를 보낼 수 있어요.
   - Worker 코드에 LINE 토큰 기본값이 들어 있어요. **토큰을 새로 발급받아 교체(rotate)하시는 걸 권장해요.**
5. **파일:** Storage 업로드가 실패하면 파일을 base64로 바꿔 DB(jsonb)에 넣어요. 그러면 DB가 커지고 저장이 실패할 수 있어요. 버킷도 공개라, URL을 알면 누구나 환자 스캔 파일을 받을 수 있어요.
6. **주문번호 충돌:** 같은 분(minute)에 주문이 두 개 들어오면 같은 번호가 되어 두 번째 저장이 조용히 실패해요.
7. **정렬·목록:** `date`가 문자열이라 날짜순 정렬이 틀리고, 주문은 20개까지만 보여요.
8. **삭제와 환불:** 주문을 삭제해도 크레딧을 돌려주지 않아요.
9. **XSS:** 주문 카드에서 사용자 입력값(치과명, 환자 ID, 사이즈, 메모, 파일명)이 이스케이프 없이 HTML에 들어가요.
10. **CNC 계산서:** 품목 이름이 `[object Object]`로 나오고, 금액이 0 THB예요.
11. **계산서 번호와 보관:** 번호가 날짜 + 랜덤 4자리라 겹칠 수 있어요. 또 계산서가 30일 뒤 자동 삭제돼요.
12. **입력 단순화:** 브랜드와 쉐이드가 "모든 치아 공통"이라 치아마다 다르게 고를 수 없어요 (예전 폼은 치아별로 고를 수 있었음).

### 확인이 필요한 질문
1. **가격/결제:** CNC 주문은 크레딧으로만 결제하나요? 1크레딧은 몇 바트인가요? 계산서 금액은 "사용한 크레딧 × 단가"로 계산할까요, 아니면 크레딧을 **충전할 때** 계산서를 발행할까요?
2. **크레딧 충전:** allAbut에서도 관리자가 직접 충전하나요? 아니면 결제(PromptPay 등)를 붙일 계획인가요?
3. **세금계산서:** 판매자 정보(BIO PLANT Co., Ltd., Tax ID, 주소)를 allAbut에서도 그대로 쓰나요? 태국 세금계산서 규정상 **번호를 순서대로** 매겨야 하나요? 보관 기간은 얼마로 할까요? (Dentalk는 30일 뒤 삭제)
4. **치아 선택:** 사랑니(18·28·38·48)는 계속 빼나요? allAbut 데스크 안내 문구에는 "11~48"로 되어 있어요.
5. **치아별 옵션:** 브랜드와 쉐이드를 치아마다 다르게 고를 수 있게 할까요, 아니면 지금처럼 공통으로 할까요?
6. **케이스:** 한 주문에 환자(케이스)는 1명으로 고정하나요, 여러 명을 허용하나요?
7. **파일:** 받는 형식을 STL·PLY·OBJ·3MF + 사진·PDF로 제한할까요? 파일 하나의 최대 크기는요? (SQL에는 50MB로 해 뒀어요)
8. **LINE 알림:**
   - allAbut에서도 LINE 알림을 쓰나요? 쓴다면 Dentalk Worker를 같이 쓰나요, 새로 만드나요?
   - 고객 LINE ID는 주문할 때 입력받나요, 아니면 프로필에서 연결하나요?
9. **관리자 화면:** allAbut 안에 관리자 화면을 만드나요, Dentalk 관리자 화면을 계속 쓰나요? (두 앱의 DB가 달라서 같이 쓰려면 연동이 필요해요)
10. **주문 수정:** 접수 후 치아·파일을 바꾸는 것도 허용하나요? (지금 SQL은 배송·환자·납기만 수정 가능. 치아를 바꾸면 크레딧도 다시 계산해야 해요)
11. **기존 데이터:** Dentalk의 기존 주문·크레딧을 allAbut으로 옮겨야 하나요?
12. **언어:** 처음에는 en/ko만 가져와도 될까요? (Dentalk는 9개 언어, allAbut은 en/ko 기준)
