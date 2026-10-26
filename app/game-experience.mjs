import { GAME_MODES, STORY_CHAPTERS, getObjectives } from "./game-core.mjs";

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const ratio = (value) =>
  Number.isFinite(value) ? `${Math.round(value * 100)}%` : "인력 없음";

export function welcomeMarkup() {
  return `<div class="welcome-art"><span class="overline">WELCOME TO TERRITORY COMMAND</span><h2 id="dialog-title">좋은 운영은<br>업무와 사람의 균형에서.</h2><p>권역을 살피고, 사람과 지역을 옮기며<br>모든 팀이 감당할 수 있는 편성을 만들어 보세요.</p></div><div class="intro-rules"><div><b>01</b><strong>빨간 숫자를 찾아보세요</strong><p>가동률 100% 초과는 맡은 업무가 인원보다 많다는 뜻이에요.</p></div><div><b>02</b><strong>두 가지 방법으로 풀어요</strong><p>여유 있는 권역의 인력을 지원하거나, 담당 지역을 다른 권역으로 옮겨요.</p></div><div><b>03</b><strong>양쪽의 변화를 확인해요</strong><p>받는 쪽과 보내는 쪽이 함께 바뀝니다. 총인원은 49명으로 같아요.</p></div></div><p class="welcome-footnote">2025년 정상 시공비를 업무량으로 환산한 훈련입니다. 인원·Capa·수요 사건은 게임 가정이에요. 기존 진행은 따로 보관됩니다.</p><div class="dialog-actions"><button class="action-button" data-dialog-action="modes">바로 모드 선택</button><button class="gold-button" data-dialog-action="learn">2분 따라하며 배우기 →</button></div>`;
}

export function modePickerMarkup(saves) {
  const card = (mode, symbol, title, summary, features) => {
    const save = saves[mode];
    const progress = !save
      ? "아직 시작하지 않았어요"
      : mode === "tutorial"
        ? save.finished
          ? "따라하기 완료"
          : `따라하기 ${save.tutorialStep < 2 ? 1 : 2}/2 진행 중`
        : save.finished
          ? "3개 장 모두 완료"
          : `${save.round}${mode === "story" ? "장" : "턴"} · ${save.mode === "open" ? "자유 실험 중" : `명령 ${save.points}회 남음`}`;
    return `<article class="mode-card ${mode}"><span class="mode-emblem" aria-hidden="true">${symbol}</span><span class="overline">${mode === "open" ? "OPEN PLAY" : mode === "story" ? "STORY CAMPAIGN" : "LEARN BY DOING"}</span><h3>${title}</h3><p>${summary}</p><ul>${features.map((f) => `<li>✓ ${f}</li>`).join("")}</ul><small>${progress}</small><button class="gold-button" data-mode="${mode}">${save ? "이어하기" : "시작하기"} →</button>${save ? `<button class="mode-reset quiet" data-fresh-mode="${mode}">처음부터 새로 시작</button>` : ""}</article>`;
  };
  return `<span class="overline">CHOOSE YOUR WAY</span><h2 id="dialog-title">어떤 운영가가 되어볼까요?</h2><p>세 모드는 각각 저장됩니다. 언제든 모드 선택으로 돌아와 이어할 수 있어요.</p><div class="mode-grid">${card("tutorial", "✦", "따라하기", "인력 지원과 지역 이관을 직접 해보며 감을 익혀요.", ["단계별 안내와 버튼 강조", "선택 전후 가동률 비교", "2가지 행동을 한 번씩 연습"])}${card("open", "◇", "오픈 모드", "원하는 편성을 자유롭게 시험하고 결과를 비교해요.", ["명령 횟수·종료 턴 제한 없음", "원할 때 다음 수요 상황 적용", "1인당 Capa 가정 변경 가능"])}${card("story", "⚑", "스토리 모드", "첫 부임부터 수요 변화까지, 각 장의 과제를 해결해요.", ["3개 장 · 턴당 명령 6회", "목표 달성 시 다음 장 해금", "힌트·이번 턴 다시 시도"])} </div>`;
}

export function learningMarkup(data, game, metrics) {
  if (game.mode === "open")
    return `<div><span class="overline">OPEN PLAY · 자유 실험</span><strong>내가 설계하는 권역 운영</strong><p>횟수 제한 없이 편성해 보세요. 준비되면 ‘다음 수요 상황’으로 운영안을 시험할 수 있어요.</p></div><button class="action-button" data-learning-action="modes">모드 선택 ↗</button>`;
  if (game.mode === "story") {
    const chapter = STORY_CHAPTERS[game.round - 1];
    const objectives = getObjectives(data, game);
    return `<div><span class="overline">STORY · 제${game.round}장 ${game.finished ? "완료" : "진행 중"}</span><strong>${esc(chapter.title)}</strong><p>${game.finished ? "모든 장을 완료했습니다. 결산 보고서에서 선택의 결과를 확인해 보세요." : esc(chapter.narrative)}</p><div class="objective-chips">${objectives.map((o) => `<span class="${o.passed ? "done" : ""}">${o.passed ? "✓" : "○"} ${esc(o.label)} · ${esc(o.value)}</span>`).join("")}</div></div><div class="learning-buttons"><button class="action-button" data-learning-action="hint">참모 힌트</button><button class="quiet" data-learning-action="retry" ${game.finished ? "disabled" : ""}>이번 턴 다시</button></div>`;
  }
  const t = (id) => metrics.territories.find((t) => t.id === id);
  const stages = [
    [
      "1 / 2 · 인원 지원",
      "이현석 → 김용훈, 1명을 지원해 보세요",
      "김용훈의 115% 과부하를 줄이는 연습입니다. 오른쪽 ‘다른 권역에서 지원받기’가 이현석인지 확인한 뒤 지원 버튼을 눌러 주세요.",
      "안내된 권역으로 이동",
      "focus",
    ],
    [
      "1 / 2 · 지원 성공",
      "한 사람의 이동이 두 권역을 바꿨어요",
      `김용훈은 115% → ${ratio(t("t_kim_yonghun").utilization)}, 이현석은 78% → ${ratio(t("t_lee_hyeonseok").utilization)}가 됐어요. 지원받은 쪽은 가벼워지고, 보낸 쪽은 조금 더 바빠집니다.`,
      "이제 지역 이관 배우기 →",
      "next",
    ],
    [
      "2 / 2 · 지역 이관",
      "서대문구를 김정훈 → 이현석으로 옮겨보세요",
      "오른쪽 지역 선택에서 서울특별시 서대문구를 고르고, 이 지역을 맡길 권역을 이현석으로 지정해 이관 버튼을 눌러 주세요.",
      "서대문구와 이관 설정 보기",
      "focus",
    ],
    [
      "2 / 2 · 이관 성공",
      "사람 대신 담당 지역을 옮겼어요",
      `김정훈은 114% → ${ratio(t("t_kim_jeonghun").utilization)}, 이현석은 87% → ${ratio(t("t_lee_hyeonseok").utilization)}가 됐어요. 지역을 받는 권역의 여유도 함께 확인해야 합니다.`,
      "따라하기 완료 →",
      "next",
    ],
    [
      "따라하기 완료",
      "이제 나만의 한 수를 둘 준비가 됐어요",
      "인원을 지원하거나 지역을 이관한 뒤, 두 권역의 가동률을 함께 확인하세요. 배운 내용으로 자유롭게 실험하거나 이야기를 시작해 보세요.",
      "플레이 모드 선택 →",
      "modes",
    ],
  ];
  const [tag, title, description, button, action] = stages[game.tutorialStep];
  return `<div class="tutorial-step-mark">${game.tutorialStep < 2 ? "1" : "2"}<small>/2</small></div><div class="tutorial-copy"><span class="overline">FOLLOW ALONG · ${tag}</span><strong>${title}</strong><p>${description}</p></div><div class="learning-buttons"><button class="gold-button" data-learning-action="${action}">${button}</button><button class="quiet" data-learning-action="modes">나중에 이어하기</button></div>`;
}

export function chapterBriefMarkup(data, game) {
  const chapter = STORY_CHAPTERS[game.round - 1];
  return `<span class="overline">STORY BRIEFING · CHAPTER ${game.round}</span><h2 id="dialog-title">${esc(chapter.title)}</h2><p>${esc(chapter.narrative)}</p><div class="chapter-objectives">${getObjectives(
    data,
    game,
  )
    .map((o, i) => `<div><b>0${i + 1}</b><span>${esc(o.label)}</span></div>`)
    .join(
      "",
    )}</div><p class="rules-detail">이번 턴의 명령은 6회입니다. 목표를 모두 달성하면 다음 장으로 넘어갈 수 있고, 막히면 힌트를 보거나 이번 턴을 다시 시작할 수 있어요.</p><div class="dialog-actions"><button class="gold-button" data-dialog-action="close">${game.round}장 작전 시작 →</button></div>`;
}

export function rulesMarkup(game) {
  return `<span class="overline">HOW TO PLAY · ${GAME_MODES[game.mode]}</span><h2 id="dialog-title">업무와 사람, 두 가지만 보세요</h2><div class="intro-rules compact"><div><b>1</b><strong>100%를 넘으면 과부하</strong><p>맡은 업무 ÷ 인원의 Capa가 가동률이에요. 빨간 권역부터 살펴보세요.</p></div><div><b>2</b><strong>사람 또는 지역을 옮겨요</strong><p>권역을 선택해 인력 지원을 지시하거나, 지역을 선택해 담당 권역을 바꾸세요.</p></div><div><b>3</b><strong>보내는 쪽도 함께 확인해요</strong><p>전체 인원은 49명입니다. 한쪽을 도우면서 다른 곳이 과부하가 되지 않는지 보세요.</p></div></div><div class="rules-grid"><div><span>오픈 모드</span><strong>횟수·턴 제한 없이 실험</strong></div><div><span>스토리 모드</span><strong>목표를 푸는 3개 장</strong></div></div><p class="rules-detail">운영 점수 = 업무 커버율 45% + 인력 균형 35% + 인력 효율 20%. 정상 시공비는 업무량의 대리 지표이고, 월 수치는 연간 금액 ÷ 12입니다. 이동시간·작업시간·품질을 계산한 실제 인력 예측은 아닙니다.</p><p class="rules-detail">초기 배치 46명 + 예비 3명, 1인당 연간 Capa ${(game.capacityPerPerson / 1e6).toLocaleString("ko-KR")}백만원은 훈련 가정입니다. 기본 → 서울 +12% → 서울 원복·경기 +10% 순서의 수요 사건을 사용합니다.</p>${game.mode === "open" ? `<form class="rules-form"><label for="capacity-assumption">다른 Capa로 새 오픈 게임 시작 · 기존 오픈 진행 초기화</label><div class="input-row"><input class="rules-input" id="capacity-assumption" type="number" min="1" max="200" step="1" value="${game.capacityPerPerson / 1e6}" required><span>백만원 / 인·년</span></div><div class="dialog-actions"><button type="button" class="action-button" data-dialog-action="close">계속 플레이</button><button type="submit" class="gold-button">이 가정으로 새 오픈 게임 →</button></div></form>` : `<p class="rules-detail">스토리와 따라하기의 Capa는 목표를 달성할 수 있도록 연간 50백만원으로 고정합니다. 다른 가정은 오픈 모드에서 실험해 주세요.</p><div class="dialog-actions"><button class="action-button" data-dialog-action="learn">따라하기</button><button class="gold-button" data-dialog-action="close">계속 플레이 →</button></div>`}`;
}
