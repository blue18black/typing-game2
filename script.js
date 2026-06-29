const TIME_LIMIT_MS = 5000; // 1人あたりの残り時間

const ALL_GROUP = {
  id: "all",
  name: "全グループ",
  color: "#0075C2",
  members: GROUPS.flatMap((g) => g.members),
};

const GROUPS_WITH_ALL = [...GROUPS, ALL_GROUP];

const screens = {
  home: document.getElementById("screen-home"),
  ready: document.getElementById("screen-ready"),
  game: document.getElementById("screen-game"),
  result: document.getElementById("screen-result"),
};

const el = {
  groupGrid: document.getElementById("group-grid"),
  readyGroupName: document.getElementById("ready-group-name"),
  conveyorTrack: document.getElementById("conveyor-track"),
  btnStart: document.getElementById("btn-start"),
  btnReadyHome: document.getElementById("btn-ready-home"),
  countdownOverlay: document.getElementById("countdown-overlay"),
  countdownNumber: document.getElementById("countdown-number"),
  hudTimer: document.getElementById("hud-timer"),
  hudRemaining: document.getElementById("hud-remaining"),
  hudMiss: document.getElementById("hud-miss"),
  hudCombo: document.getElementById("hud-combo"),
  photoFrame: document.getElementById("photo-frame"),
  gamePhoto: document.getElementById("game-photo"),
  timeBarFill: document.getElementById("time-bar-fill"),
  typeTarget: document.getElementById("type-target"),
  gameKanji: document.getElementById("game-kanji"),
  gameRomaji: document.getElementById("game-romaji"),
  resultRank: document.getElementById("result-rank"),
  resultStats: document.getElementById("result-stats"),
  btnRetry: document.getElementById("btn-retry"),
  btnResultHome: document.getElementById("btn-result-home"),
};

const state = {
  screen: "home",
  group: null,
  counting: false,
  roundActive: false,
  queue: [],
  queueIndex: 0,
  startTime: 0,
  timerHandle: null,
  current: null,
  cleared: 0,
  miss: 0,
  timeouts: 0,
  combo: 0,
  maxCombo: 0,
  correctKeystrokes: 0,
  missKeystrokes: 0,
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("is-active"));
  screens[name].classList.add("is-active");
  state.screen = name;
}

function getGroup(groupId) {
  return GROUPS_WITH_ALL.find((g) => g.id === groupId);
}

// ---------- ホーム画面 ----------
function renderHomeGrid() {
  el.groupGrid.innerHTML = "";
  GROUPS_WITH_ALL.forEach((group) => {
    const card = document.createElement("div");
    card.className = "group-card";

    if (group.id === "all") {
      card.classList.add("all-card");
      GROUPS.slice(0, 4).forEach((g) => {
        const img = document.createElement("img");
        img.src = g.image;
        img.className = "thumb";
        card.appendChild(img);
      });
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = group.name;
      card.appendChild(label);
    } else {
      const img = document.createElement("img");
      img.src = group.image;
      img.className = "thumb";
      card.appendChild(img);
      const label = document.createElement("div");
      label.className = "label";
      label.style.backgroundColor = group.color;
      label.textContent = group.name;
      card.appendChild(label);
    }

    card.addEventListener("click", () => selectGroup(group.id));
    el.groupGrid.appendChild(card);
  });
}

// ---------- ゲーム開始画面 ----------
function selectGroup(groupId) {
  state.group = groupId;
  const group = getGroup(groupId);

  el.readyGroupName.textContent = group.name;
  el.readyGroupName.style.backgroundColor = group.color;

  el.conveyorTrack.innerHTML = "";
  const photos = [...group.members, ...group.members];
  photos.forEach((m) => {
    const img = document.createElement("img");
    img.src = m.image;
    img.alt = m.name;
    el.conveyorTrack.appendChild(img);
  });

  showScreen("ready");
}

// ---------- カウントダウン ----------
function startCountdown() {
  if (state.counting) return;
  state.counting = true;
  const seq = ["3", "2", "1", "スタート!"];
  el.countdownOverlay.classList.remove("hidden");

  let i = 0;
  function step() {
    el.countdownNumber.textContent = seq[i];
    el.countdownNumber.style.animation = "none";
    void el.countdownNumber.offsetWidth;
    el.countdownNumber.style.animation = "";
    i++;
    if (i < seq.length) {
      setTimeout(step, 700);
    } else {
      setTimeout(() => {
        el.countdownOverlay.classList.add("hidden");
        state.counting = false;
        startGame();
      }, 500);
    }
  }
  step();
}

// ---------- ゲーム画面 ----------
function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function startGame() {
  const group = getGroup(state.group);
  state.roundActive = true;
  state.queue = shuffle(group.members);
  state.queueIndex = 0;
  state.cleared = 0;
  state.miss = 0;
  state.timeouts = 0;
  state.combo = 0;
  state.maxCombo = 0;
  state.correctKeystrokes = 0;
  state.missKeystrokes = 0;
  state.startTime = Date.now();

  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = setInterval(tickTimer, 100);

  updateHud();
  showScreen("game");
  spawnCard();
}

function advanceQueue() {
  state.queueIndex++;
  updateHud();
  if (state.queueIndex >= state.queue.length) {
    endRound();
  } else if (state.roundActive) {
    spawnCard();
  }
}

function renderTypeTarget(member) {
  el.gameKanji.textContent = member.name;
  el.gameRomaji.innerHTML = "";
  member.romaji.split("").forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "ch" + (i === 0 ? " current" : "");
    span.textContent = ch;
    el.gameRomaji.appendChild(span);
  });
}

function spawnCard() {
  const member = state.queue[state.queueIndex];

  renderTypeTarget(member);
  el.gamePhoto.src = member.image;
  el.gamePhoto.alt = member.name;

  state.current = {
    member,
    typedPos: 0,
    resolved: false,
  };

  el.timeBarFill.style.transition = "none";
  el.timeBarFill.style.width = "100%";
  void el.timeBarFill.offsetWidth;

  requestAnimationFrame(() => {
    el.timeBarFill.style.transition = `width ${TIME_LIMIT_MS}ms linear`;
    el.timeBarFill.style.width = "0%";
  });
}

function updateRomajiHighlight() {
  const spans = el.gameRomaji.querySelectorAll(".ch");
  spans.forEach((span, i) => {
    span.classList.remove("typed", "current");
    if (i < state.current.typedPos) span.classList.add("typed");
    else if (i === state.current.typedPos) span.classList.add("current");
  });
}

function flashMiss() {
  el.typeTarget.classList.remove("shake");
  void el.typeTarget.offsetWidth;
  el.typeTarget.classList.add("shake");
}

function onCardTimedOut() {
  const cur = state.current;
  if (!cur || cur.resolved) return;
  cur.resolved = true;
  state.timeouts++;
  state.combo = 0;
  advanceQueue();
}

function completeCurrentCard() {
  const cur = state.current;
  if (!cur || cur.resolved) return;
  cur.resolved = true;

  el.timeBarFill.style.transition = "none";

  el.photoFrame.classList.remove("success");
  void el.photoFrame.offsetWidth;
  el.photoFrame.classList.add("success");

  state.cleared++;
  updateHud();

  setTimeout(() => {
    advanceQueue();
  }, 280);
}

function updateHud() {
  el.hudRemaining.textContent = Math.max(0, state.queue.length - state.queueIndex);
  el.hudMiss.textContent = state.miss;
  el.hudCombo.textContent = state.combo;
}

function tickTimer() {
  const elapsed = (Date.now() - state.startTime) / 1000;
  el.hudTimer.textContent = elapsed.toFixed(1);
}

function endRound() {
  if (!state.roundActive) return;
  state.roundActive = false;
  clearInterval(state.timerHandle);
  finishGame();
}

function onKeyDown(e) {
  if (state.screen === "ready" && e.key === "Enter") {
    e.preventDefault();
    startCountdown();
    return;
  }

  if (state.screen !== "game" || !state.current) return;
  if (e.key.length !== 1 || !/[a-zA-Z]/.test(e.key)) return;
  e.preventDefault();

  const cur = state.current;
  const expected = cur.member.romaji[cur.typedPos];

  if (e.key.toLowerCase() === expected) {
    cur.typedPos++;
    state.correctKeystrokes++;
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    updateRomajiHighlight();

    if (cur.typedPos >= cur.member.romaji.length) {
      completeCurrentCard();
    }
  } else {
    state.miss++;
    state.missKeystrokes++;
    state.combo = 0;
    flashMiss();
    updateHud();
  }
}

// ---------- 結果画面 ----------
function computeRank(charsPerSec, accuracy) {
  const score = charsPerSec * (accuracy / 100);
  if (score >= 6) return "神";
  if (score >= 4) return "凡人";
  if (score >= 2.5) return "平凡";
  if (score >= 1.2) return "がんばれ";
  return "一般ファン";
}

function finishGame() {
  const elapsed = (Date.now() - state.startTime) / 1000;
  const totalKeystrokes = state.correctKeystrokes + state.missKeystrokes;
  const accuracy = totalKeystrokes > 0 ? (state.correctKeystrokes / totalKeystrokes) * 100 : 100;
  const speed = elapsed > 0 ? state.correctKeystrokes / elapsed : 0;
  const rank = computeRank(speed, accuracy);

  el.resultRank.textContent = rank;
  el.resultStats.innerHTML = `
    <tr><td>プレイ時間</td><td>${elapsed.toFixed(2)} 秒</td></tr>
    <tr><td>クリア人数</td><td>${state.cleared} 人</td></tr>
    <tr><td>入力文字数</td><td>${state.correctKeystrokes}</td></tr>
    <tr><td>ミス数</td><td>${state.miss}</td></tr>
    <tr><td>見逃し数</td><td>${state.timeouts}</td></tr>
    <tr><td>正確率</td><td>${accuracy.toFixed(1)} %</td></tr>
    <tr><td>平均速度</td><td>${speed.toFixed(2)} 文字/秒</td></tr>
    <tr><td>最大コンボ</td><td>${state.maxCombo}</td></tr>
  `;

  showScreen("result");
}

function goHome() {
  showScreen("home");
}

// ---------- イベント登録 ----------
el.btnStart.addEventListener("click", startCountdown);
el.btnReadyHome.addEventListener("click", goHome);
el.btnRetry.addEventListener("click", startCountdown);
el.btnResultHome.addEventListener("click", goHome);
document.addEventListener("keydown", onKeyDown);
el.timeBarFill.addEventListener("transitionend", (e) => {
  if (e.propertyName === "width") onCardTimedOut();
});

renderHomeGrid();
showScreen("home");
