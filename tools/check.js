#!/usr/bin/env node
// =================================================================
// allAbut — 자동 검사 (고칠 때마다 돌려요)
//   실행:  node tools/check.js            (Node 만 있으면 돼요 — 패키지 설치 없음)
//   결과:  항목마다 "통과" / "실패 n건" + 실패한 파일 · 줄 · 이유. 하나라도 실패하면 종료 코드 1
//   빠르게(빌드 빼고): node tools/check.js --no-build
//
//   (1) 문법            모든 .js 파일 node --check (dist · node_modules 제외)
//   (2) 번역 9개 언어    키 빠짐 · {n} 같은 자리표시 · 빈 문구 · 코드에서 쓰는 키가 영어 파일에 있는지
//   (3) DB 함수 이름     .rpc('이름') · cncRpc('이름') 이 sql/*.sql 에 있는지 + p_ 인자 이름이 가장 마지막 정의와 맞는지
//   (4) 오류 안내        sql 의 raise exception 'CODE' → CNC_ERROR_CODES + uiErrorMessage 문구
//   (5) 빌드             bash build.sh · index.html 이 부르는 파일 · __SITE_URL__ · dist 에 .md/.sql/.ts 없음 · tools/ 배포 안 됨
//   (6) 디자인 스위치    css/theme-*.css 의 모든 규칙이 html[data-site-theme="…"] 아래
//   (7) 브랜드 규칙      lang/ · legal/ 문구: CNC 없는 "Custom Abutment / 커스텀 어버트먼트", "<" 없는 "5μm"
//   (8) 비밀값           서비스 키 · 긴 JWT · Turnstile 시크릿 · 개인 키처럼 보이는 글자
//
// ⚠️ 허용 목록은 아래 ALLOW 한 곳에만. 넣을 때는 항상 이유를 같이 적어요.
// =================================================================

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NO_BUILD = process.argv.includes('--no-build');

// =================================================================
// 허용 목록 (항목마다 이유)
// =================================================================
const ALLOW = {
  // (3) 저장소 밖(Supabase DB 에만 있는) 함수 — sql/ 에 정의가 없어도 통과
  rpcOutsideRepo: {
    admin_list_users: '고객 목록 함수 — 처음 Supabase 대시보드에서 만든 함수라 sql/ 에 정의가 없어요 (CLAUDE.md "직원 계정": admin_list_users 는 repo 밖)',
    get_my_line_link_code: 'LINE 연결 코드 발급 — 처음 LINE 설정 때 대시보드에서 만든 함수 (LINE_SETUP.md)',
    unlink_my_line: 'LINE 연결 해제 — 처음 LINE 설정 때 대시보드에서 만든 함수 (LINE_SETUP.md)'
  },

  // (4) sql 의 raise exception 코드 중, 화면이 uiErrorMessage 표를 거치지 않고 따로 처리하거나 화면에 나올 일이 없는 것
  errorCodesHandledElsewhere: {
    DEADLINE_REQUIRED: '디자인 승인 창(ui/page-orders.js approve)이 직접 받아서 날짜 칸 아래 빨간 글씨 err_deadline_required 로 보여 줘요 (uiErrorMessage 를 거치지 않음)',
    DEADLINE_TOO_EARLY: '디자인 승인 창(ui/page-orders.js approve)이 직접 받아서 가장 빠른 날과 함께 err_deadline_too_early 로 보여 줘요 (uiErrorMessage 를 거치지 않음)'
  },

  // (2) 코드에서 t('키') 로 쓰지만 영어 파일에 없어도 되는 키 (예: 일부러 키 이름 그대로 보여 주는 곳)
  unknownTranslationKeys: {
  },

  // (2) 이름이 _one 으로 끝나지만 단수 문구(tf 의 key_one)가 아닌 키 — 기본 키가 없어도 되고, 9개 언어 모두에 있어야 해요
  oneSuffixNotPlural: {
    staff_clients_pick_one: '"치과를 하나 이상 선택해 주세요" — 뜻이 "하나 고르기"라서 이름에 _one 이 붙었을 뿐, 단수 문구가 아니에요 (t() 로 그대로 써요)'
  },

  // (2) 영어에 있는 키인데 특정 언어에 없어도 되는 것 — "언어:키"
  translationMissing: {
  },

  // (2) 자리표시({n} 등)가 영어와 달라도 되는 것 — "언어:키"
  placeholderMismatch: {
  },

  // (8) 비밀값처럼 보이지만 공개해도 되는 값
  secrets: [
    { file: 'config.js', match: 'sb_publishable_', reason: 'Supabase publishable(anon) 키 — 브라우저에 공개되는 키 (데이터 보호는 RLS)' },
    { file: 'config.js', match: 'TURNSTILE_SITE_KEY', reason: 'Cloudflare Turnstile 사이트 키 — 공개 키 (시크릿 키는 Supabase 대시보드에만)' }
  ]
};

// =================================================================
// 도우미
// =================================================================
const results = [];
function section(no, title, fn) {
  const fails = [];
  const notes = [];
  const fail = (file, line, reason) => fails.push({ file, line, reason });
  try {
    fn(fail, (n) => notes.push(n));
  } catch (e) {
    fails.push({ file: 'tools/check.js', line: 0, reason: '검사 중 오류: ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' / ') : e) });
  }
  results.push({ no, title, fails, notes });
  const head = fails.length ? `❌ (${no}) ${title} — 실패 ${fails.length}건` : `✅ (${no}) ${title} — 통과`;
  console.log(head + (notes.length ? '  (' + notes.join(', ') + ')' : ''));
  fails.slice(0, 60).forEach(f => console.log(`   · ${f.file}${f.line ? ':' + f.line : ''} — ${f.reason}`));
  if (fails.length > 60) console.log(`   · … 그 밖에 ${fails.length - 60}건`);
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// 저장소 파일 목록 (git 이 관리하는 파일 + 아직 안 올린 새 파일, .gitignore 는 제외) — git 이 없으면 폴더를 직접 훑어요
function repoFiles() {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  let list;
  if (r.status === 0) list = r.stdout.split('\n').filter(Boolean);
  else {
    list = [];
    (function walk(dir) {
      for (const name of fs.readdirSync(path.join(ROOT, dir))) {
        if (['.git', 'node_modules', 'dist'].includes(name)) continue;
        const rel = dir ? dir + '/' + name : name;
        if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel); else list.push(rel);
      }
    })('');
  }
  return list.filter(f => !/^(dist|node_modules)\//.test(f) && !/(^|\/)node_modules\//.test(f) && exists(f));
}
const FILES = repoFiles();

// 위치를 알 수 있는 괄호 짝 찾기 (문자열 안의 괄호는 건너뛰어요)
function matchClose(text, openIndex, open, close) {
  let depth = 0, quote = null;
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// 언어 파일 읽기 → { all: {키: 문구}, top: Set(위쪽 allAbut 문구 키 — 아래쪽 Dentalk 가져온 문구는 빼요), text }
const LANGS = ['en', 'ko', 'th', 'zh', 'vi', 'es', 'tr', 'ar', 'fa'];
function loadLang(code) {
  const rel = 'lang/lang-' + code + '.js';
  const text = read(rel);
  const ctx = { window: {} };
  ctx.LANG = ctx.window.LANG = {};
  vm.runInNewContext(text, ctx, { filename: rel });
  const all = ctx.LANG[code] || {};
  const cut = text.indexOf('Dentalk 에서 가져온 CNC 문구');
  const topText = cut === -1 ? text : text.slice(0, cut);
  const top = new Set();
  const re = /^\s{2}([a-z0-9_]+):/gm;
  let m;
  while ((m = re.exec(topText))) top.add(m[1]);
  return { rel, text, all, top };
}
const keyLine = (lang, key) => { const i = lang.text.search(new RegExp('^\\s{2}' + key + ':', 'm')); return i === -1 ? 0 : lineOf(lang.text, i); };
const placeholders = (s) => Array.from(new Set(String(s).match(/\{[a-zA-Z0-9_]+\}/g) || [])).sort();

// CSS 규칙 나누기 (@media · @supports 안도 들어가요, @keyframes · @font-face · @page 는 건너뛰어요)
function cssRules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));   // 주석 지우기 (줄 번호는 그대로)
  const out = [];
  (function parse(start, end) {
    let i = start;
    while (i < end) {
      const j = css.indexOf('{', i);
      if (j === -1 || j >= end) break;
      const sel = css.slice(i, j).trim();
      const k = matchClose(css, j, '{', '}');
      if (k === -1) break;
      if (/^@(media|supports)/.test(sel)) parse(j + 1, k);
      else if (!/^@(keyframes|-webkit-keyframes|font-face|page)/.test(sel) && sel) out.push({ sel: sel.replace(/\s+/g, ' '), line: lineOf(css, i + (css.slice(i, j).length - css.slice(i, j).trimStart().length)) });
      i = k + 1;
    }
  })(0, css.length);
  return out;
}

console.log('allAbut 자동 검사 — ' + ROOT + '\n');

// =================================================================
// (1) 문법
// =================================================================
section(1, '문법 (node --check)', (fail, note) => {
  const js = FILES.filter(f => f.endsWith('.js'));
  for (const f of js) {
    const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
    if (r.status !== 0) {
      const msg = (r.stderr || '').split('\n').filter(Boolean);
      const lm = (r.stderr || '').match(/:(\d+)\n/);
      fail(f, lm ? +lm[1] : 0, '문법 오류 — ' + (msg.find(l => /Error/.test(l)) || msg[0] || '알 수 없음'));
    }
  }
  note(js.length + '개 파일');
});

// =================================================================
// (2) 번역 9개 언어
// =================================================================
const L = {};
section(2, '번역 9개 언어', (fail, note) => {
  for (const c of LANGS) L[c] = loadLang(c);
  const en = L.en;
  // 단수 문구(_one)는 단수 · 복수가 있는 언어(en · es · ar)에만 — 다른 언어에 없어도 정상 (lang.js 의 tf 규칙)
  const isPluralOnly = (k) => /_one$/.test(k) && !ALLOW.oneSuffixNotPlural[k];
  let checked = 0;
  for (const key of en.top) {
    const enVal = en.all[key];
    if (typeof enVal !== 'string') continue;
    checked++;
    if (!enVal.trim()) fail(en.rel, keyLine(en, key), `영어 "${key}" 문구가 비어 있어요`);
    for (const c of LANGS.slice(1)) {
      const lang = L[c];
      const v = lang.all[key];
      if (v == null) {
        if (isPluralOnly(key) || ALLOW.translationMissing[c + ':' + key]) continue;
        fail(lang.rel, 0, `"${key}" 가 없어요 (영어에는 있어요)`);
        continue;
      }
      if (typeof v !== 'string') continue;
      if (!v.trim()) { fail(lang.rel, keyLine(lang, key), `"${key}" 문구가 비어 있어요`); continue; }
      if (ALLOW.placeholderMismatch[c + ':' + key]) continue;
      const a = placeholders(enVal).join(' '), b = placeholders(v).join(' ');
      if (isPluralOnly(key)) {   // 단수 문구는 영어보다 자리표시가 적어도 돼요 (예: 아랍어 "سن واحد" — 숫자를 글자로)
        const extra = placeholders(v).filter(p => !placeholders(enVal).includes(p));
        if (extra.length) fail(lang.rel, keyLine(lang, key), `"${key}" 에 영어에 없는 자리표시 ${extra.join(' ')}`);
      } else if (a !== b) fail(lang.rel, keyLine(lang, key), `"${key}" 자리표시가 영어와 달라요 (영어: ${a || '없음'} / 이 언어: ${b || '없음'})`);
    }
  }
  // _one 키는 기본 키가 있어야 하고, 기본 키의 자리표시를 넘지 않아야 해요
  for (const c of LANGS) {
    for (const key of Object.keys(L[c].all)) {
      if (!isPluralOnly(key)) continue;
      const base = key.replace(/_one$/, '');
      if (L.en.all[base] == null) fail(L[c].rel, keyLine(L[c], key), `"${key}" 의 기본 키 "${base}" 가 영어에 없어요`);
    }
  }
  // 코드에서 쓰는 키 → 영어 파일에 있는지 (키를 이어 붙여 만드는 경우는 제외 — 예: t('wiz_step' + n))
  const codeFiles = FILES.filter(f => /\.(js|html)$/.test(f) && !/^(lang|legal|tools|supabase|docs)\//.test(f) && f !== 'lang.js');
  let used = 0;
  const callRe = /(?<![\w$.])(t|tf|tEn)\(\s*(['"])([a-z0-9_]+)\2\s*[,)]/g;
  const attrRe = /data-i18n(?:-placeholder)?=["']([a-z0-9_]+)["']/g;
  for (const f of codeFiles) {
    const text = read(f);
    for (const re of [callRe, attrRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const key = re === callRe ? m[3] : m[1];
        used++;
        if (en.all[key] == null && !ALLOW.unknownTranslationKeys[key]) fail(f, lineOf(text, m.index), `번역 키 "${key}" 가 영어 파일(lang/lang-en.js)에 없어요`);
      }
    }
  }
  note(`영어 키 ${checked}개 × 8개 언어, 코드에서 쓰는 키 ${used}곳`);
});

// =================================================================
// (3) DB 함수 이름 · 인자
// =================================================================
section(3, 'DB 함수 이름 · p_ 인자', (fail, note) => {
  // sql 정의 모으기 (파일 이름 순서 = 실행 순서, 같은 이름은 뒤의 것이 "가장 마지막 정의")
  const defs = {};
  const sqlFiles = FILES.filter(f => /^sql\/.*\.sql$/.test(f)).sort();
  for (const f of sqlFiles) {
    const text = read(f);
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
    let m;
    while ((m = re.exec(text))) {
      const open = m.index + m[0].length - 1;
      const close = matchClose(text, open, '(', ')');
      const body = text.slice(open + 1, close);
      const params = [];
      let depth = 0, cur = '';
      for (const ch of body) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { params.push(cur); cur = ''; } else cur += ch;
      }
      if (cur.trim()) params.push(cur);
      const list = params.map(p => p.trim().replace(/^(in|out|inout|variadic)\s+/i, '')).filter(Boolean).map(p => ({
        name: p.split(/\s+/)[0].replace(/"/g, ''),
        optional: /\bdefault\b|=/i.test(p)
      }));
      defs[m[1].toLowerCase()] = { file: f, line: lineOf(text, m.index), params: list };
    }
  }
  // 부르는 곳
  const callFiles = FILES.filter(f => (/\.js$/.test(f) && !/^(lang|legal|tools|docs)\//.test(f)) || /^supabase\/functions\/.*\.ts$/.test(f));
  let calls = 0;
  for (const f of callFiles) {
    const text = read(f);
    const re = /(?:\.rpc|\bcncRpc)\(\s*(['"])([a-z0-9_]+)\1/g;
    let m;
    while ((m = re.exec(text))) {
      calls++;
      const name = m[2];
      const ln = lineOf(text, m.index);
      const def = defs[name];
      if (!def) {
        if (ALLOW.rpcOutsideRepo[name]) continue;
        fail(f, ln, `DB 함수 "${name}" 가 sql/*.sql 에 없어요 (이름이 틀렸거나, 새 SQL 파일이 빠졌어요)`);
        continue;
      }
      // 넘기는 인자: 바로 뒤가 { … } 글자 그대로면 p_ 이름을 읽어요 (변수로 넘기면 건너뜀)
      let i = m.index + m[0].length;
      while (/\s/.test(text[i])) i++;
      let passed = null;
      if (text[i] === ')') passed = [];
      else if (text[i] === ',') {
        i++;
        while (/\s/.test(text[i])) i++;
        if (text[i] === '{') {
          const close = matchClose(text, i, '{', '}');
          const obj = text.slice(i + 1, close);
          // 맨 위 단계의 키만 (안쪽 { } 는 지우고 읽어요)
          let flat = '', depth = 0;
          for (const ch of obj) { if (ch === '{' || ch === '[' || ch === '(') depth++; if (depth === 0) flat += ch; if (ch === '}' || ch === ']' || ch === ')') depth--; }
          passed = (flat.match(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=[:,]|$)/g) || []).map(s => s.replace(/[,\s]/g, ''));
        }
      }
      if (!passed) continue;
      const names = def.params.map(p => p.name);
      passed.filter(p => /^p_/.test(p) && !names.includes(p)).forEach(p =>
        fail(f, ln, `"${name}" 에 없는 인자 "${p}" 를 넘겨요 (가장 마지막 정의 ${def.file}:${def.line} 의 인자: ${names.join(', ') || '없음'})`));
      passed.filter(p => !/^p_/.test(p)).forEach(p =>
        fail(f, ln, `"${name}" 인자 "${p}" 가 p_ 로 시작하지 않아요 (DB 함수 인자 이름과 같아야 해요)`));
      def.params.filter(p => !p.optional && !passed.includes(p.name)).forEach(p =>
        fail(f, ln, `"${name}" 에 꼭 필요한 인자 "${p.name}" 를 안 넘겨요 (${def.file}:${def.line})`));
    }
  }
  note(`부르는 곳 ${calls}곳, sql 함수 ${Object.keys(defs).length}개`);
});

// =================================================================
// (4) 오류 안내 (sql 오류 코드 → 화면 문구)
// =================================================================
section(4, '오류 안내 (raise exception → CNC_ERROR_CODES · uiErrorMessage)', (fail, note) => {
  // 화면이 아는 코드: cnc/*.js 의 CNC_ERROR_CODES 에 넣는 모든 글자
  const known = new Set();
  for (const f of FILES.filter(x => /^cnc\/.*\.js$/.test(x))) {
    const text = read(f);
    const re = /CNC_ERROR_CODES\s*=\s*([\s\S]*?);/g;
    let m;
    while ((m = re.exec(text))) (m[1].match(/'([A-Za-z0-9_]+)'/g) || []).forEach(s => known.add(s.slice(1, -1)));
  }
  // uiErrorMessage 표
  const lay = read('ui/layout.js');
  const fnAt = lay.indexOf('function uiErrorMessage');
  const mapAt = lay.indexOf('var map = {', fnAt);
  const mapEnd = matchClose(lay, lay.indexOf('{', mapAt), '{', '}');
  const mapText = lay.slice(mapAt, mapEnd);
  const map = {};
  let m;
  const mre = /([A-Za-z0-9_]+)\s*:\s*'([a-z0-9_]+)'/g;
  while ((m = mre.exec(mapText))) map[m[1]] = { key: m[2], line: lineOf(lay, mapAt + m.index) };
  // 표의 문구 키가 영어 파일에 있는지
  for (const [code, v] of Object.entries(map)) if (L.en && L.en.all[v.key] == null) fail('ui/layout.js', v.line, `uiErrorMessage 의 ${code} → 번역 키 "${v.key}" 가 영어 파일에 없어요`);
  // sql 의 오류 코드
  const seen = {};
  for (const f of FILES.filter(x => /^sql\/.*\.sql$/.test(x)).sort()) {
    const text = read(f);
    const re = /raise\s+exception\s+'([A-Za-z][A-Za-z0-9_]*)'/gi;
    while ((m = re.exec(text))) if (!seen[m[1]]) seen[m[1]] = { file: f, line: lineOf(text, m.index) };
  }
  for (const [code, at] of Object.entries(seen)) {
    if (ALLOW.errorCodesHandledElsewhere[code]) continue;
    if (!known.has(code)) fail(at.file, at.line, `오류 코드 ${code} 가 CNC_ERROR_CODES(cnc/cnc-core.js 등)에 없어요 → 화면에 "문제가 발생했어요" 만 나와요`);
    if (!map[code]) fail(at.file, at.line, `오류 코드 ${code} 의 안내 문구가 uiErrorMessage(ui/layout.js) 표에 없어요`);
  }
  note(`sql 오류 코드 ${Object.keys(seen).length}개`);
});

// =================================================================
// (5) 빌드
// =================================================================
section(5, '빌드 (bash build.sh → dist)', (fail, note) => {
  if (NO_BUILD) { note('--no-build: 건너뜀'); return; }
  const r = spawnSync('bash', ['build.sh'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { fail('build.sh', 0, '빌드 실패 — ' + ((r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' / '))); return; }
  const dist = path.join(ROOT, 'dist');
  const all = [];
  (function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else all.push(path.relative(dist, p).split(path.sep).join('/')); } })(dist);
  // index.html 이 부르는 내 파일
  const idx = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const re = /(?:src|href)="([^"#]+)"/g;
  let m, refs = 0;
  while ((m = re.exec(idx))) {
    const ref = m[1].replace(/\?.*$/, '');
    if (/^(https?:)?\/\//.test(ref) || /^(mailto|tel|data):/.test(ref) || !ref) continue;
    refs++;
    if (!all.includes(ref.replace(/^\//, ''))) fail('dist/index.html', lineOf(idx, m.index), `index.html 이 부르는 "${ref}" 가 dist 에 없어요 → build.sh 목록에 추가`);
  }
  // __SITE_URL__ 이 남았는지
  for (const f of all.filter(x => /\.(html|txt|xml|js|css|json|webmanifest)$/.test(x))) {
    const t = fs.readFileSync(path.join(dist, f), 'utf8');
    const i = t.indexOf('__SITE_URL__');
    if (i !== -1 && !/\.js$/.test(f)) fail('dist/' + f, lineOf(t, i), '__SITE_URL__ 자리가 채워지지 않았어요 (build.sh 의 SITE_URL)');
  }
  // 올라가면 안 되는 파일
  all.filter(x => /\.(md|sql|ts)$/i.test(x)).forEach(x => fail('dist/' + x, 0, '배포 폴더에 안내문 · SQL · 서버 함수 파일이 들어갔어요'));
  all.filter(x => /^tools\//.test(x)).forEach(x => fail('dist/' + x, 0, 'tools/ 는 배포되면 안 돼요'));
  const b = read('build.sh');
  if (/^\s*tools\b/m.test(b.slice(b.indexOf('DIRS=('), b.indexOf(')', b.indexOf('DIRS=('))))) fail('build.sh', 0, 'DIRS 목록에 tools 가 있어요 (배포되면 안 돼요)');
  note(`dist 파일 ${all.length}개, index.html 이 부르는 파일 ${refs}개`);
});

// =================================================================
// (6) 디자인 스위치 (theme-*.css 는 자기 디자인 아래에만)
// =================================================================
section(6, '디자인 스위치 (css/theme-*.css 범위)', (fail, note) => {
  const themes = FILES.filter(f => /^css\/theme-[a-z0-9-]+\.css$/.test(f));
  let n = 0;
  for (const f of themes) {
    const name = f.match(/theme-([a-z0-9-]+)\.css$/)[1];
    const prefix = `html[data-site-theme="${name}"]`;
    for (const r of cssRules(read(f))) {
      n++;
      for (const part of r.sel.split(',').map(s => s.trim())) {
        if (!part.startsWith(prefix)) fail(f, r.line, `"${part.slice(0, 70)}" 가 ${prefix} 밖에 있어요 → 다른 디자인까지 바뀌어요`);
      }
    }
  }
  if (!themes.length) fail('css/', 0, 'css/theme-*.css 파일을 못 찾았어요');
  note(`${themes.length}개 파일, 규칙 ${n}개`);
});

// =================================================================
// (7) 브랜드 규칙 (lang/ · legal/ 문구)
// =================================================================
section(7, '브랜드 규칙 (CNC · <5μm)', (fail, note) => {
  const files = FILES.filter(f => /^(lang|legal)\/.*\.js$/.test(f));
  let n = 0;
  for (const f of files) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//')) return;   // 주석은 제외
      const s = line.replace(/\/\/.*$/, (m) => /['"]/.test(m) ? m : '');   // 줄 끝 주석 제외 (문자열 안의 // 는 그대로)
      let m;
      const reEn = /custom abutment/gi;
      while ((m = reEn.exec(s))) { n++; if (!/CNC\s*$/i.test(s.slice(Math.max(0, m.index - 6), m.index))) fail(f, i + 1, `"${s.substr(m.index, 20)}" — 제품 이름 앞에 CNC 가 없어요`); }
      const reKo = /커스텀\s*어버트먼트/g;
      while ((m = reKo.exec(s))) { n++; if (!/CNC\s*$/.test(s.slice(Math.max(0, m.index - 6), m.index))) fail(f, i + 1, `"${s.substr(m.index, 12)}" — 제품 이름 앞에 CNC 가 없어요`); }
      const reUm = /5\s?μm/g;
      while ((m = reUm.exec(s))) {
        n++;
        const before = s.slice(Math.max(0, m.index - 10), m.index);
        if (/<\s*$/.test(before) || /&lt;\s*$/.test(before)) continue;   // <5μm 맞음
        if (/allAbut\s*$/.test(before)) continue;                        // 로고 표시 "allAbut 5μm"
        fail(f, i + 1, `"${s.substr(Math.max(0, m.index - 8), 16).trim()}" — 정밀도는 "<5μm" 로 써요`);
      }
    });
  }
  note(`${files.length}개 파일, 찾은 곳 ${n}개`);
});

// =================================================================
// (8) 비밀값
// =================================================================
section(8, '비밀값', (fail, note) => {
  const PATTERNS = [
    { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, what: '긴 JWT (Supabase service_role 키 등)' },
    { re: /sb_secret_[A-Za-z0-9_-]{8,}/g, what: 'Supabase 시크릿 키' },
    { re: /service_role['"]?\s*[:=]\s*['"][A-Za-z0-9._-]{20,}/g, what: 'service_role 키 값' },
    { re: /0x4AAAAAAA[A-Za-z0-9_-]{25,}/g, what: 'Cloudflare Turnstile 시크릿 키' },
    { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, what: '개인 키' },
    { re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/g, what: '결제 서비스 시크릿 키' },
    { re: /(?:LINE_CHANNEL_(?:ACCESS_TOKEN|SECRET)|NOTIFY_SECRET)\s*[:=]\s*['"][^'"\s]{16,}['"]/g, what: 'LINE · 알림 비밀값을 코드에 직접' }
  ];
  const text = FILES.filter(f => /\.(js|ts|html|css|sql|md|json|sh|py|txt|toml|yml|yaml|env)$/i.test(f) || /(^|\/)\.env/.test(f));
  let n = 0;
  for (const f of text) {
    const t = read(f);
    n++;
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(t))) {
        const line = t.split('\n')[lineOf(t, m.index) - 1];
        if (ALLOW.secrets.some(a => a.file === f && line.includes(a.match))) continue;
        fail(f, lineOf(t, m.index), `${p.what} 처럼 보여요 ("${m[0].slice(0, 12)}…") → 코드에 넣지 말고 Supabase Secrets · Vault · 대시보드에`);
      }
    }
  }
  note(`${n}개 파일`);
});

// =================================================================
// 요약
// =================================================================
const failed = results.filter(r => r.fails.length);
console.log('\n' + (failed.length
  ? `❌ 실패 ${failed.length}개 항목 (${failed.map(r => '(' + r.no + ')').join(' ')}) — 고친 뒤 다시 돌려 주세요`
  : '✅ 전부 통과'));
process.exit(failed.length ? 1 : 0);
