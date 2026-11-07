import "./style.css";

const $ = (sel, scope = document) => scope.querySelector(sel);

const root = document.documentElement;
const mode = $("#mode");
const level = $("#level");
const title = $("#title");
const board = $("#board");
const winLine = $("#slash");
const newGameBtn = $("#new-game");
const resetScoreBtn = $("#reset-score");
const themeBtn = $("#theme");
const themeColor = $('meta[name="theme-color"]');
const tiles = [...board.querySelectorAll("[data-tile]")];
const slashLines = [...winLine.querySelectorAll("line")];
const cards = Object.fromEntries(
  ["x", "d", "o"].map((k) => {
    const el = $(`[data-score="${k}"]`);
    return [k, { el, n: $("[data-n]", el), l: $("[data-l]", el) }];
  }),
);

//wins
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const mark = (color, body, extra = "") =>
  `<svg class="mark ${color}" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="3" ${extra} aria-hidden="true">${body}</svg>`;

const MARKS = {
  X: mark(
    "text-ink",
    '<path pathLength="1" d="M10 10L46 46"/><path pathLength="1" d="M46 10L10 46"/>',
    'stroke-linecap="round"',
  ),
  O: mark("text-mark-o", '<circle pathLength="1" cx="28" cy="28" r="18" transform="rotate(-90 28 28)"/>'),
};

const NAMES = {
  cpu: { x: "You", d: "Draws", o: "Computer" },
  pvp: { x: "Player X", d: "Draws", o: "Player O" },
};

const ANIMS = ["animate-rise", "animate-pop"];

/* ---------- State ---------- */
let state = Array(9).fill(null);
let turn = "X";
let starter = "X";
let over = false;
let busy = false;
let refreshing = false;
let pending = null;
let gid = 0;
let currentMode = "cpu";
let currentLevel = "medium";
const score = { x: 0, d: 0, o: 0 };

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ms = (n) => (reduceMotion() ? 0 : n);

function replay(el, cls) {
  el.classList.remove(...ANIMS);
  void el.offsetWidth;
  el.classList.add(cls);
}

function setTitle(text) {
  if (title.textContent.trim() === text) return;
  title.textContent = text;
  replay(title, "animate-rise");
}

const turnTitle = () => (currentMode === "cpu" ? (turn === "X" ? "Your Turn" : "Thinking…") : `${turn}’s Turn`);

const syncLock = () => board.toggleAttribute("data-locked", over || busy || refreshing);

const labelTile = (i) =>
  tiles[i].setAttribute("aria-label", `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}, ${state[i] ?? "empty"}`);

//theme
function applyTheme(t) {
  root.dataset.theme = t;
  themeBtn.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
  themeColor?.setAttribute("content", t === "dark" ? "#000000" : "#f5f5f7");
}

themeBtn.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("theme", next);
  } catch {}
  const swap = () => applyTheme(next);
  if (document.startViewTransition && !reduceMotion()) document.startViewTransition(swap);
  else swap();
});

applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

function renderScore(winKey) {
  const names = NAMES[currentMode];
  for (const k of ["x", "d", "o"]) {
    const { el, n, l } = cards[k];
    if (l.textContent !== names[k]) {
      l.textContent = names[k];
      replay(l, "animate-rise");
    }
    const val = String(score[k]);
    if (n.textContent !== val) {
      n.textContent = val;
      replay(n, k === winKey ? "animate-pop" : "animate-rise");
    }
    el.toggleAttribute("data-win", k === winKey);
  }
}

function updateTurn() {
  cards.x.el.toggleAttribute("data-turn", !over && turn === "X");
  cards.o.el.toggleAttribute("data-turn", !over && turn === "O");
  syncLock();
}

//slashh
function drawWinLine(combo) {
  const br = board.getBoundingClientRect();
  const first = tiles[combo[0]].getBoundingClientRect();
  const last = tiles[combo[2]].getBoundingClientRect();
  const center = (r) => [r.left + r.width / 2 - br.left, r.top + r.height / 2 - br.top];

  let [x1, y1] = center(first);
  let [x2, y2] = center(last);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ext = first.width * 0.28;
  const dx = ((x2 - x1) / len) * ext;
  const dy = ((y2 - y1) / len) * ext;
  x1 -= dx;
  y1 -= dy;
  x2 += dx;
  y2 += dy;
  const L = Math.hypot(x2 - x1, y2 - y1);

  winLine.setAttribute("viewBox", `0 0 ${br.width} ${br.height}`);
  winLine.style.opacity = "1";

  slashLines.forEach((line) => {
    Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => line.setAttribute(k, v));
    line.style.strokeDasharray = L;
    line.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], {
      duration: ms(1000),
      easing: "cubic-bezier(0.4, 0, 0.1, 1)",
      fill: "both",
    });
  });

  tiles.forEach((t, i) => {
    t.style.opacity = combo.includes(i) ? "" : "0.35";
  });
}

// board refrsh
async function refreshBoard(reset) {
  if (refreshing) {
    pending = reset;
    return;
  }
  refreshing = true;
  gid++;
  syncLock();

  try {
    if (reduceMotion()) {
      reset();
      return;
    }

    const out = { duration: 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" };
    const leaving = tiles
      .map((t) => t.querySelector("svg"))
      .filter(Boolean)
      .map((m) =>
        m.animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(0.8)" },
          ],
          out,
        ),
      );
    if (parseFloat(getComputedStyle(winLine).opacity) > 0) {
      leaving.push(winLine.animate([{ opacity: 1 }, { opacity: 0 }], out));
    }
    await Promise.all(leaving.map((a) => a.finished));

    reset();
    leaving.forEach((a) => a.cancel());

    //tiles effect
    const entering = tiles.map((t, i) =>
      t.animate(
        [
          { opacity: 0.4, transform: "translateY(6px) scale(0.94)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        {
          duration: 650,
          delay: (Math.floor(i / 3) + (i % 3)) * 55,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        },
      ),
    );
    await Promise.all(entering.map((a) => a.finished));
  } finally {
    refreshing = false;
    syncLock();
    if (pending) {
      const next = pending;
      pending = null;
      refreshBoard(next);
    }
  }
}

// seg controls
function moveThumb(seg, animate = true) {
  const thumb = $(".thumb", seg);
  const active = $('[aria-pressed="true"]', seg);
  if (!thumb || !active) return;
  thumb.toggleAttribute("data-instant", !animate);
  thumb.style.width = active.offsetWidth + "px";
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

function wire(seg, onChange) {
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.getAttribute("aria-pressed") === "true") return;
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === btn));
    moveThumb(seg);
    onChange(btn.dataset.v);
  });
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const winningLine = (s) => LINES.find(([a, b, c]) => s[a] && s[a] === s[b] && s[a] === s[c]) ?? null;

const winnerOf = (s) => {
  const l = winningLine(s);
  return l && s[l[0]];
};

function immediateWin(player) {
  for (let i = 0; i < 9; i++) {
    if (state[i]) continue;
    state[i] = player;
    const w = winnerOf(state);
    state[i] = null;
    if (w) return i;
  }
  return -1;
}

function minimax(s, player, depth) {
  const w = winnerOf(s);
  if (w) return w === "O" ? 10 - depth : depth - 10;
  if (s.every(Boolean)) return 0;
  let best = player === "O" ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (s[i]) continue;
    s[i] = player;
    const v = minimax(s, player === "O" ? "X" : "O", depth + 1);
    s[i] = null;
    best = player === "O" ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

function pickMove() {
  const free = state.flatMap((v, i) => (v ? [] : [i]));

  if (currentLevel === "easy") return pick(free);

  if (currentLevel === "medium") {
  if (Math.random() < 0.1) return pick(free);

  const win = immediateWin("O");
  if (win >= 0) return win;

  const block = immediateWin("X");
  if (block >= 0 && Math.random() < 0.85) return block;

  if (!state[4] && Math.random() < 0.8) return 4;

  const corners = free.filter((i) => [0, 2, 6, 8].includes(i));
  if (corners.length && Math.random() < 0.7) return pick(corners);

  return pick(free);
}

  // hard mode
  if (free.length === 9) return pick([0, 2, 4, 6, 8]);
  let bestScore = -Infinity;
  let bestMoves = [];
  for (const i of free) {
    state[i] = "O";
    const v = minimax(state, "X", 1);
    state[i] = null;
    if (v > bestScore) {
      bestScore = v;
      bestMoves = [i];
    } else if (v === bestScore) bestMoves.push(i);
  }
  return pick(bestMoves);
}

function computerTurn(delay = 550) {
  if (currentMode !== "cpu" || turn !== "O" || over) return;
  busy = true;
  syncLock();
  const g = gid;
  const go = () => {
    if (g !== gid) return;
    if (refreshing) return setTimeout(go, 100);
    busy = false;
    place(pickMove());
  };
  setTimeout(go, delay);
}

function resetGame() {
  gid++;
  busy = false;
  state = Array(9).fill(null);
  turn = starter;
  over = false;
  tiles.forEach((t, i) => {
    t.innerHTML = "";
    t.disabled = false;
    t.style.opacity = "";
    labelTile(i);
  });
  slashLines.forEach((l) => l.getAnimations().forEach((a) => a.cancel()));
  winLine.style.opacity = "0";
  setTitle(turnTitle());
  renderScore();
  updateTurn();
  computerTurn(1000);
}

function newSession() {
  Object.assign(score, { x: 0, d: 0, o: 0 });
  starter = "X";
  resetGame();
}

function finish() {
  over = true;
  starter = starter === "X" ? "O" : "X";
  tiles.forEach((t) => (t.disabled = true));
}

let ac;
let soundOn = true;

function audio() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  if (ac && ac.state === "suspended") ac.resume();
  return ac;
}

function tone(freq, start, dur, vol) {
  const a = audio();
  if (!a || !soundOn) return;
  const o = a.createOscillator();
  const g = a.createGain();
  const t = a.currentTime + start;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function resultSound(who) {
  if (who === "D") {
    tone(440, 0.1, 0.5, 0.12);
    tone(392, 0.25, 0.7, 0.12);
    return;
  }
  const d = Math.max(0, (ms(380) + ms(1000)) / 1000 - 0.08);
  if (currentMode === "cpu" && who === "O") {
    tone(330, d, 0.6, 0.15);
    tone(247, d + 0.15, 0.9, 0.15);
  } else {
    tone(659, d, 0.9, 0.18);
    tone(880, d + 0.1, 1.1, 0.16);
    tone(1318, d + 0.22, 1.2, 0.08);
  }
}

const soundBtn = $("#sound");

soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.setAttribute("aria-pressed", soundOn);
  soundBtn.setAttribute("aria-label", soundOn ? "Mute sound" : "Unmute sound");
  if (soundOn) tone(560, 0, 0.1, 0.12); // confirmation blip when turning on
});

function place(i) {
  state[i] = turn;
  tiles[i].innerHTML = MARKS[turn];
  tiles[i].disabled = true;
  labelTile(i);

  tone(turn === "X" ? 560 : 420, 0, 0.1, 0.12); // move sound

  const combo = winningLine(state);
  if (combo) {
    finish();
    const key = turn.toLowerCase();
    score[key]++;
    setTitle(currentMode === "cpu" ? (turn === "X" ? "You Win" : "Computer Wins") : `${turn} Wins`);
    updateTurn();
    resultSound(turn); // win sound

    const g = gid;
    const lineAt = ms(380);
    const doneAt = lineAt + ms(1000) + 120;
    setTimeout(() => g === gid && drawWinLine(combo), lineAt);
    setTimeout(() => g === gid && renderScore(key), doneAt);
    return;
  }

  if (state.every(Boolean)) {
    finish();
    score.d++;
    setTitle("It’s a Draw");
    updateTurn();
    renderScore("d");
    resultSound("D"); // draw sound
    return;
  }

  turn = turn === "X" ? "O" : "X";
  setTitle(turnTitle());
  updateTurn();
  computerTurn();
}
board.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-tile]");
  if (!tile || refreshing || over || busy) return;
  const i = tiles.indexOf(tile);
  if (!state[i]) place(i);
});

newGameBtn.addEventListener("click", () => refreshBoard(resetGame));

wire(mode, (v) => {
  currentMode = v;
  const cpu = v === "cpu";
  level.toggleAttribute("data-off", !cpu);
  level.inert = !cpu;
  refreshBoard(newSession);
});

wire(level, (v) => {
  currentLevel = v;
  refreshBoard(newSession);
});

resetScoreBtn.addEventListener("click", () => {
  Object.assign(score, { x: 0, d: 0, o: 0 });
  renderScore();
});

const placeThumbs = () => [mode, level].forEach((s) => moveThumb(s, false));
placeThumbs();
window.addEventListener("load", placeThumbs);
window.addEventListener("resize", placeThumbs);

resetGame();
