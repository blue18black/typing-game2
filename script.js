const TIME_LIMIT_MS = 5000; // 1人あたりの残り時間

// 寿司打と同様、複数のローマ字表記を受け付けるための同義グループ
const SYMMETRIC_ROMAJI_GROUPS = [
  ["shi", "si"],
  ["sha", "sya"],
  ["chi", "ti"],
  ["tsu", "tu"],
  ["ji", "zi"],
  ["fu", "hu"],
];

function isVowelOrY(ch) {
  return !!ch && "aiueoy".includes(ch);
}

function buildRomajiTokens(romaji) {
  const tokens = [];
  let i = 0;
  while (i < romaji.length) {
    let matched = null;

    // ん(撥音): 後ろが母音/yでない場合は n / nn のどちらでも可とする
    if (romaji[i] === "n" && !isVowelOrY(romaji[i + 1])) {
      const canonicalLen = romaji[i + 1] === "n" ? 2 : 1;
      const isTrailing = i + canonicalLen === romaji.length;
      matched = isTrailing
        ? { canonicalLen, alternates: ["nn"] }
        : { canonicalLen, alternates: ["nn", "n"] };
    } else {
      for (const group of SYMMETRIC_ROMAJI_GROUPS) {
        for (const form of group) {
          if (romaji.startsWith(form, i) && (!matched || form.length > matched.canonicalLen)) {
            matched = { canonicalLen: form.length, alternates: group };
          }
        }
      }
    }

    if (matched) {
      tokens.push({ display: romaji.slice(i, i + matched.canonicalLen), alternates: matched.alternates });
      i += matched.canonicalLen;
    } else {
      tokens.push({ display: romaji[i], alternates: [romaji[i]] });
      i += 1;
    }
  }
  return tokens;
}

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
  btnGameHome: document.getElementById("btn-game-home"),
  btnGameRetry: document.getElementById("btn-game-retry"),
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
  return GROUPS.find((g) => g.id === groupId);
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amount = Math.round(255 * percent);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ---------- ホーム画面 ----------
function renderHomeGrid() {
  el.groupGrid.innerHTML = "";
  GROUPS.forEach((group) => {
    const card = document.createElement("div");
    card.className = "group-card";

    const img = document.createElement("img");
    img.src = group.image;
    img.className = "thumb";
    card.appendChild(img);
    const label = document.createElement("div");
    label.className = "label";
    label.style.backgroundColor = group.color;
    label.textContent = group.name;
    card.appendChild(label);

    card.addEventListener("click", () => selectGroup(group.id));
    el.groupGrid.appendChild(card);
  });
}

// ---------- ゲーム開始画面 ----------
function selectGroup(groupId) {
  state.group = groupId;
  const group = getGroup(groupId);

  document.documentElement.style.setProperty("--accent", group.color);
  document.documentElement.style.setProperty("--accent-light", shadeColor(group.color, 0.25));
  document.documentElement.style.setProperty("--accent-dark", shadeColor(group.color, -0.3));

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
        state.counting = false;
        startGame();
        el.countdownOverlay.classList.add("fade-out");
        setTimeout(() => {
          el.countdownOverlay.classList.add("hidden");
          el.countdownOverlay.classList.remove("fade-out");
        }, 350);
      }, 700);
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

function renderTokenSpan(token, isCurrent) {
  const tokSpan = document.createElement("span");
  tokSpan.className = "tok";
  token.display.split("").forEach((ch, ci) => {
    const chSpan = document.createElement("span");
    chSpan.className = "tokch" + (isCurrent && ci === 0 ? " current" : "");
    chSpan.textContent = ch;
    tokSpan.appendChild(chSpan);
  });
  return tokSpan;
}

function renderTypeTarget(member, tokens) {
  el.gameKanji.textContent = member.name;
  el.gameRomaji.innerHTML = "";
  tokens.forEach((token, i) => {
    el.gameRomaji.appendChild(renderTokenSpan(token, i === 0));
  });
}

function spawnCard() {
  const member = state.queue[state.queueIndex];
  const tokens = buildRomajiTokens(member.romaji);

  renderTypeTarget(member, tokens);
  el.gamePhoto.src = member.image;
  el.gamePhoto.alt = member.name;

  state.current = {
    member,
    tokens,
    tokenIndex: 0,
    tokenTyped: "",
    pendingExtraN: false,
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
  const cur = state.current;
  const tokSpans = el.gameRomaji.querySelectorAll(".tok");
  tokSpans.forEach((tokSpan, i) => {
    const chSpans = tokSpan.querySelectorAll(".tokch");
    chSpans.forEach((chSpan, ci) => {
      chSpan.classList.remove("typed", "current");
      if (i < cur.tokenIndex) {
        chSpan.classList.add("typed");
      } else if (i === cur.tokenIndex) {
        if (ci < cur.tokenTyped.length) chSpan.classList.add("typed");
        else if (ci === cur.tokenTyped.length) chSpan.classList.add("current");
      }
    });
  });
}

// 入力した文字に合わせて、表示中のローマ字を該当する表記(si->shi など)に切り替える
function updateCurrentTokenDisplay() {
  const cur = state.current;
  const token = cur.tokens[cur.tokenIndex];
  const tokSpan = el.gameRomaji.querySelectorAll(".tok")[cur.tokenIndex];
  if (!token || !tokSpan) return;
  const viable = token.alternates.filter((alt) => alt.startsWith(cur.tokenTyped));
  const displayText = viable.length === 1 ? viable[0] : token.display;
  if (tokSpan.textContent !== displayText) {
    tokSpan.innerHTML = "";
    displayText.split("").forEach((ch) => {
      const chSpan = document.createElement("span");
      chSpan.className = "tokch";
      chSpan.textContent = ch;
      tokSpan.appendChild(chSpan);
    });
  }
}

// nn のように、確定済みのトークンに余分な文字が打たれた分を表示に追加する
function appendExtraTypedChar(tokenIdx, ch) {
  const tokSpan = el.gameRomaji.querySelectorAll(".tok")[tokenIdx];
  if (!tokSpan) return;
  const chSpan = document.createElement("span");
  chSpan.className = "tokch typed";
  chSpan.textContent = ch;
  tokSpan.appendChild(chSpan);
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
  const key = e.key.toLowerCase();

  // 直前に短い方の「n」で確定した直後、余分な n をもう1つ打っても不正解にしない(nn入力対策)
  if (cur.pendingExtraN) {
    cur.pendingExtraN = false;
    if (key === "n") {
      state.correctKeystrokes++;
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      appendExtraTypedChar(cur.tokenIndex - 1, "n");
      return;
    }
  }

  const token = cur.tokens[cur.tokenIndex];
  const attempt = cur.tokenTyped + key;
  const stillPossible = token.alternates.some((alt) => alt.startsWith(attempt));

  if (stillPossible) {
    cur.tokenTyped = attempt;
    state.correctKeystrokes++;
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    updateCurrentTokenDisplay();

    if (token.alternates.includes(attempt)) {
      cur.pendingExtraN = attempt === "n" && token.alternates.includes("nn");
      cur.tokenIndex++;
      cur.tokenTyped = "";
    }
    updateRomajiHighlight();

    if (cur.tokenIndex >= cur.tokens.length) {
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

function stopRound() {
  state.roundActive = false;
  clearInterval(state.timerHandle);
  state.current = null;
}

function exitGameToHome() {
  stopRound();
  goHome();
}

function exitGameToReady() {
  stopRound();
  selectGroup(state.group);
}

// ---------- イベント登録 ----------
el.btnStart.addEventListener("click", startCountdown);
el.btnReadyHome.addEventListener("click", goHome);
el.btnGameHome.addEventListener("click", exitGameToHome);
el.btnGameRetry.addEventListener("click", exitGameToReady);
el.btnRetry.addEventListener("click", exitGameToReady);
el.btnResultHome.addEventListener("click", goHome);
document.addEventListener("keydown", onKeyDown);
el.timeBarFill.addEventListener("transitionend", (e) => {
  if (e.propertyName === "width") onCardTimedOut();
});

renderHomeGrid();
showScreen("home");
