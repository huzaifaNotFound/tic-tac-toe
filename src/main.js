import "./style.css";

const mode = document.querySelector("#mode");
const level = document.querySelector("#level");
const title = document.querySelector("#title");
const board = document.querySelector("#board");
const newGameBtn = document.querySelector("#new-game");
const resetScoreBtn = document.querySelector("#reset-score");
const winLine = document.querySelector("#slash");
const tiles = [...board.querySelectorAll("[data-tile]")];
const lines = [...winLine.querySelectorAll("line")];
const scoreEls = {
  x: document.querySelector('[data-score="x"]'),
  d: document.querySelector('[data-score="d"]'),
  o: document.querySelector('[data-score="o"]'),
};

const XS = `<svg class="mark block size-14 text-ink pointer-events-none" viewBox="0 0 56 56"
  fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
  <path pathLength="1" d="M10 10L46 46"/><path pathLength="1" d="M46 10L10 46"/></svg>`;

const OS = `<svg class="mark block size-14 text-mark-o pointer-events-none" viewBox="0 0 56 56"
  fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
  <circle pathLength="1" cx="28" cy="28" r="18" transform="rotate(-90 28 28)"/></svg>`;

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


let state = Array(9).fill(null);
let turn = "X";
let over = false;
let currentMode = "cpu";
const score = { x: 0, d: 0, o: 0 };
let gid = 0; 
let refreshing = false;
let pending = null;

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;


function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function setTitle(text) {
  if (title.textContent === text) return;
  title.textContent = text;
  replay(title, "animate-rise");
}

const turnTitle = () =>
  currentMode === "cpu" ? (turn === "X" ? "Your Turn" : "Thinking…") : `${turn}’s Turn`;

const labels = () =>
  currentMode === "cpu"
    ? { x: "You", d: "Draws", o: "Computer" }
    : { x: "Player X", d: "Draws", o: "Player O" };


function renderScore(winKey) {
  const names = labels();
  for (const k of ["x", "d", "o"]) {
    const el = scoreEls[k];
    const n = el.querySelector("[data-n]");
    const l = el.querySelector("[data-l]");

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
  scoreEls.x.toggleAttribute("data-turn", !over && turn === "X");
  scoreEls.o.toggleAttribute("data-turn", !over && turn === "O");
}


function drawWinLine(combo) {
  const br = board.getBoundingClientRect();
  const a = tiles[combo[0]].getBoundingClientRect();
  const c = tiles[combo[2]].getBoundingClientRect();

  let x1 = a.left + a.width / 2 - br.left,
    y1 = a.top + a.height / 2 - br.top;
  let x2 = c.left + c.width / 2 - br.left,
    y2 = c.top + c.height / 2 - br.top;

   const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len,
    uy = (y2 - y1) / len,
    ext = a.width * 0.28;
  x1 -= ux * ext;
  y1 -= uy * ext;
  x2 += ux * ext;
  y2 += uy * ext;
  const L = Math.hypot(x2 - x1, y2 - y1);

  winLine.setAttribute("viewBox", `0 0 ${br.width} ${br.height}`);
  winLine.style.opacity = "1";

  lines.forEach((line) => {
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.style.strokeDasharray = L;
    line.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], {
      duration: 1000,
      easing: "cubic-bezier(0.4, 0, 0.1, 1)",
      fill: "both",
    });
  });

 
  tiles.forEach((t, i) => {
    t.style.opacity = combo.includes(i) ? "" : "0.35";
  });
}


async function refreshBoard(reset) {
  if (refreshing) {
    pending = reset;
    return;
  }
  refreshing = true;

  try {
    if (reduceMotion()) {
      reset();
      return;
    }

    
    const out = { duration: 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" };
    const leaving = [];
    tiles.forEach((t) => {
      const mark = t.querySelector("svg");
      if (mark)
        leaving.push(
          mark.animate(
            [
              { opacity: 1, transform: "scale(1)" },
              { opacity: 0, transform: "scale(0.8)" },
            ],
            out,
          ),
        );
    });
    if (winLine) leaving.push(winLine.animate([{ opacity: 1 }, { opacity: 0 }], out));
    await Promise.all(leaving.map((a) => a.finished));

    
    reset();
    leaving.forEach((a) => a.cancel());

    
    const entering = tiles.map((t, i) => {
      const row = Math.floor(i / 3),
        col = i % 3;
      return t.animate(
        [
          { opacity: 0.4, transform: "translateY(6px) scale(0.94)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 650, delay: (row + col) * 55, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
      );
    });
    await Promise.all(entering.map((a) => a.finished));
  } finally {
    refreshing = false;
    if (pending) {
      const next = pending;
      pending = null;
      refreshBoard(next);
    }
  }
}


function moveThumb(seg, animate = true) {
  const thumb = seg.querySelector(".thumb");
  const active = seg.querySelector('[aria-pressed="true"]');
  if (!thumb || !active) return;
  thumb.toggleAttribute("data-instant", !animate);
  thumb.style.width = active.offsetWidth + "px";
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

function wire(seg, onChange) {
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.getAttribute("aria-pressed") === "true") return;
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === btn));
    moveThumb(seg);
    onChange?.(btn.dataset.v);
  });
}


function resetGame() {
  gid++;
  state = Array(9).fill(null);
  turn = "X";
  over = false;
  tiles.forEach((t) => {
    t.innerHTML = "";
    t.disabled = false;
    t.style.opacity = "";
  });
  lines.forEach((l) => l.getAnimations().forEach((a) => a.cancel()));
  winLine.style.opacity = "0";
  renderScore();
  updateTurn();
}

function findWinner() {
  return LINES.find(([a, b, c]) => state[a] && state[a] === state[b] && state[a] === state[c]) ?? null;
}

function place(i) {
  state[i] = turn;
  tiles[i].innerHTML = turn === "X" ? XS : OS;
  tiles[i].disabled = true;

  const combo = findWinner();
  if (combo) {
    over = true;
    const key = turn.toLowerCase();
    score[key]++;
    setTitle(currentMode === "cpu" ? (turn === "X" ? "You Win" : "Computer Wins") : `${turn} Wins`);
    updateTurn();

    const g = gid;
    setTimeout(() => {
      if (g === gid) drawWinLine(combo);
    }, 380); 
    setTimeout(() => {
      if (g === gid) renderScore(key);
    }, 1500); 
    return;
  }

  if (state.every(Boolean)) {
    over = true;
    score.d++;
    setTitle("It’s a Draw");
    updateTurn();
    renderScore("d");
    return;
  }

  turn = turn === "X" ? "O" : "X";
  setTitle(turnTitle());
  updateTurn();
}

board.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-tile]");
  if (!tile || refreshing || over) return;
  const i = tiles.indexOf(tile);
  if (state[i]) return;
  place(i);
});

newGameBtn.addEventListener("click", () => refreshBoard(resetGame));

wire(mode, (v) => {
  currentMode = v;
  const cpu = v === "cpu";
  level.toggleAttribute("data-off", !cpu);
  level.inert = !cpu;
  refreshBoard(() => {
    Object.assign(score, { x: 0, d: 0, o: 0 });
    resetGame();
    setTitle(cpu ? "Your Turn" : "X’s Turn");
  });
});

wire(level, () =>
  refreshBoard(() => {
    Object.assign(score, { x: 0, d: 0, o: 0 });
    resetGame();
    setTitle("Your Turn");
  }),
);

resetScoreBtn.addEventListener("click", () => {
  Object.assign(score, { x: 0, d: 0, o: 0 });
  renderScore();
});

const placeThumbs = () => [mode, level].forEach((s) => moveThumb(s, false));
placeThumbs();
window.addEventListener("load", placeThumbs);
window.addEventListener("resize", placeThumbs);

renderScore();
updateTurn();