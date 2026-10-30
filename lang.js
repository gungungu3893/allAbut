// 번역 텍스트 모음 (나중에 채울 예정)
var LANG = { en: {}, ko: {} };

// 현재 언어 (저장된 값이 없으면 영어)
var currentLang = localStorage.getItem('lang') || 'en';

// 번역 함수: 현재 언어 → 영어 → key 순서로 찾음
function t(key) { return (LANG[currentLang] && LANG[currentLang][key]) || (LANG.en[key]) || key; }

// 언어 변경 함수
function setLang(code) { currentLang = code; localStorage.setItem('lang', code); }
