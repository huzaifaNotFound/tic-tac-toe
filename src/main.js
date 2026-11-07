import './style.css';

const mode =document.querySelector("#mode")
const level = document.querySelector('#level');
const title = document.querySelector('#title');
const board = document.querySelector('#board');

function moveThumb(seg, animate = true) {
  const thumb = seg.querySelector('.thumb');
  const active = seg.querySelector('[aria-pressed="true"]');
  if (!thumb || !active) return;
  thumb.toggleAttribute('data-instant', !animate);
  thumb.style.width = active.offsetWidth + 'px';
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

function wire(seg, onChange) {
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
 if (btn.getAttribute('aria-pressed') === 'true') return;

    seg.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', b === btn)
    );
    moveThumb(seg);
    onChange?.(btn.dataset.v);
  });
}


let currentMode = 'cpu';

function resetGame() {
  board.querySelectorAll('button').forEach((tile) => {
    tile.textContent = '';
    tile.disabled = false;
  });
}

wire(mode, (v) => {
  currentMode = v;
  const cpu = v === 'cpu';

  level.toggleAttribute('data-off', !cpu); 
  level.inert = !cpu;                      

  resetGame();
  setTitle(cpu ? 'Your Turn' : "X's Turn");
  replay(board, 'animate-settle');
});

wire(level, (v) => {
  resetGame();
  setTitle('Your Turn');
  replay(board, 'animate-settle');
});

const place = () => [mode, level].forEach((s) => moveThumb(s, false));
place();
window.addEventListener('load', place);
window.addEventListener('resize', place);

function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function setTitle(text) {
  if (title.textContent === text) return;
  title.textContent = text;
  replay(title, 'animate-rise');
}