// ===== NPC 대화 문구 모음 =====
// 모든 대화 문구가 이 파일 하나에 있어요. 문구를 바꾸려면 여기만 고치면 돼요.
//
// 구조: DIALOGS[데스크id][언어] = { npc, desk, greeting, manual:[...], startHint, needReception, bye }
// - 데스크id: reception, toothmap, designlab, scandata, checkout
// - 언어: en (영어), ko (한국어)
// - {nickname} 은 내 닉네임으로 바뀌어요
// - startHint, needReception, bye 는 아래 DIALOG_COMMON 에서 한 번에 정해요.
//   특정 데스크만 다르게 하고 싶으면 그 데스크에 같은 이름으로 직접 쓰면 그게 우선이에요.

var DIALOGS = {

  reception: {
    en: {
      npc: 'Mina',
      desk: 'Reception',
      greeting: "Welcome to allAbut, {nickname}! I'm Mina. Every order starts here at Reception.",
      manual: [
        "First, tell me who this case is for — the patient's name.",
        "Next, your clinic name and the doctor in charge.",
        "Then pick a delivery deadline. Please allow enough production time for precision milling.",
        "Once you're registered, head to Desk 02 — Tooth Map."
      ]
    },
    ko: {
      npc: '미나',
      desk: '접수',
      greeting: "allAbut에 오신 걸 환영해요, {nickname}님! 저는 미나예요. 모든 주문은 여기 접수 데스크에서 시작돼요.",
      manual: [
        "먼저 이 케이스의 환자 이름을 알려주세요.",
        "다음은 치과 이름과 담당 원장님 성함이에요.",
        "그리고 납품 희망일을 골라주세요. 정밀 밀링을 위해 제작 기간을 넉넉히 잡아주세요.",
        "접수가 끝나면 02번 데스크 — 치아 선택으로 가주세요."
      ]
    }
  },

  toothmap: {
    en: {
      npc: 'Ken',
      desk: 'Tooth Map',
      greeting: "Hi, I'm Ken. Here we choose which teeth need a custom abutment.",
      manual: [
        "You'll see a 3D dental arch. Teeth are numbered using the FDI system — 11 to 48.",
        "Click a tooth to select it. You can select several teeth in one order.",
        "Each selected tooth gets its own settings at the Design Lab.",
        "When you're done, move on to Desk 03 — Design Lab."
      ]
    },
    ko: {
      npc: '켄',
      desk: '치아 선택',
      greeting: "안녕하세요, 저는 켄이에요. 여기서는 커스텀 어버트먼트가 필요한 치아를 골라요.",
      manual: [
        "3D 치열이 보일 거예요. 치아 번호는 FDI 방식이에요 — 11번부터 48번까지.",
        "치아를 클릭하면 선택돼요. 한 주문에 여러 개를 고를 수 있어요.",
        "선택한 치아마다 디자인 랩에서 각각 설정하게 돼요.",
        "다 고르셨으면 03번 데스크 — 디자인 랩으로 가주세요."
      ]
    }
  },

  designlab: {
    en: {
      npc: 'Sora',
      desk: 'Design Lab',
      greeting: "I'm Sora from the Design Lab. Let's set up each abutment.",
      manual: [
        "For each tooth, choose the implant brand and connection system.",
        "Then choose the abutment type and material.",
        "Pick the shade and add any notes about margin or emergence profile.",
        "Next stop: Desk 04 — Scan Data."
      ]
    },
    ko: {
      npc: '소라',
      desk: '디자인 랩',
      greeting: "디자인 랩의 소라예요. 어버트먼트를 하나씩 설정해 볼게요.",
      manual: [
        "치아마다 임플란트 브랜드와 커넥션 시스템을 골라주세요.",
        "그다음 어버트먼트 타입과 재료를 골라주세요.",
        "쉐이드를 정하고, 마진이나 에머전스 프로파일에 대한 메모를 남겨주세요.",
        "다음은 04번 데스크 — 스캔 데이터예요."
      ]
    }
  },

  scandata: {
    en: {
      npc: 'Leo',
      desk: 'Scan Data',
      greeting: "Hey, I'm Leo. I handle your scan files.",
      manual: [
        "Upload STL files from your intraoral scanner.",
        "Please include upper, lower, bite, and the scan body scan.",
        "Double-check that the scan body is fully captured — it decides the fit.",
        "Then finish at Desk 05 — Checkout."
      ]
    },
    ko: {
      npc: '레오',
      desk: '스캔 데이터',
      greeting: "안녕하세요, 레오예요. 스캔 파일은 제가 담당해요.",
      manual: [
        "구강 스캐너에서 나온 STL 파일을 올려주세요.",
        "상악, 하악, 바이트, 스캔바디 스캔을 모두 넣어주세요.",
        "스캔바디가 빠짐없이 찍혔는지 꼭 확인해주세요 — 핏을 결정해요.",
        "마지막으로 05번 데스크 — 결제에서 마무리해요."
      ]
    }
  },

  checkout: {
    en: {
      npc: 'Nara',
      desk: 'Checkout',
      greeting: "Hello, I'm Nara. This is the final step.",
      manual: [
        "I'll show you a full summary of your order.",
        "Check the patient, teeth, design options, and files.",
        "Confirm and submit — you'll receive an order number.",
        "You can track your order status after submission."
      ]
    },
    ko: {
      npc: '나라',
      desk: '결제',
      greeting: "안녕하세요, 나라예요. 여기가 마지막 단계예요.",
      manual: [
        "주문 전체 내용을 한눈에 보여드릴게요.",
        "환자, 치아, 디자인 옵션, 파일을 확인해주세요.",
        "확인 후 제출하면 주문 번호가 나와요.",
        "제출한 뒤에는 주문 진행 상황을 확인할 수 있어요."
      ]
    }
  }
};


// ===== 모든 데스크 공통 문구 =====
var DIALOG_COMMON = {
  en: {
    needReception: "Please visit Mina at Reception first so we can register your case.",
    startHint: "Ready? Press Start Order.",
    bye: "See you soon!"
  },
  ko: {
    needReception: "먼저 접수 데스크의 미나에게 가서 케이스를 등록해주세요.",
    startHint: "준비되셨나요? Start Order를 눌러주세요.",
    bye: "또 만나요!"
  }
};


// ===== 대화창 버튼 / 안내 문구 =====
var DIALOG_UI = {
  en: {
    howTo: 'How do I order here?',
    startOrder: 'Start Order',
    bye: 'Bye',
    prev: '← Prev',
    next: 'Next →',
    comingSoon: 'Order form coming soon',
    clickDesk: 'Click a desk to talk',
    close: 'Close'
  },
  ko: {
    howTo: '여기서 어떻게 주문하나요?',
    startOrder: 'Start Order',
    bye: '안녕',
    prev: '← 이전',
    next: '다음 →',
    comingSoon: '주문서는 곧 준비돼요',
    clickDesk: '데스크를 눌러 대화해 보세요',
    close: '닫기'
  }
};


// 공통 문구를 각 데스크에 채워 넣기 (데스크에 직접 쓴 문구가 있으면 그대로 둠)
(function fillCommonLines() {
  Object.keys(DIALOGS).forEach(function (deskId) {
    Object.keys(DIALOG_COMMON).forEach(function (lang) {
      var lines = DIALOGS[deskId][lang];
      if (!lines) return;
      Object.keys(DIALOG_COMMON[lang]).forEach(function (key) {
        if (lines[key] === undefined) lines[key] = DIALOG_COMMON[lang][key];
      });
    });
  });
})();


// ===== 현재 언어의 데스크 대화 가져오기 =====
function getDialog(deskId) {
  var set = DIALOGS[deskId];
  if (!set) return null;
  return set[currentLang] || set.en;
}

// ===== 현재 언어의 버튼/안내 문구 가져오기 =====
function dialogUI(key) {
  var set = DIALOG_UI[currentLang] || DIALOG_UI.en;
  return set[key] !== undefined ? set[key] : DIALOG_UI.en[key];
}

// ===== {nickname} 바꾸기 =====
function fillNickname(text, nickname) {
  return String(text).replace(/\{nickname\}/g, nickname || '');
}
