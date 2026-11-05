// Board rendering, input, animations, the level overview and the menu.

import { Game, playableLevels, toRowCol, BOARD_SIZE } from './engine.js';
import {
  loadCurrent, loadSolved, loadTheme, loadUnfinished,
  saveCurrent, saveSolved, saveTheme, saveUnfinished,
} from './storage.js';

const SWIPE_DISTANCE = 20;
// Swipes within 12 degrees of a true diagonal are too unclear to act on.
const DIAGONAL_LIMIT = Math.tan((33 * Math.PI) / 180);

const NUDGE_DISTANCE = 4;
const NUDGE_MS = 160;
const CROSS_FADE_MS = 400;

const NUDGE_OFFSETS = {
  up: [0, -NUDGE_DISTANCE],
  down: [0, NUDGE_DISTANCE],
  left: [-NUDGE_DISTANCE, 0],
  right: [NUDGE_DISTANCE, 0],
};

const ARROW_KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const screen = document.querySelector('.game');
const levelNumber = document.querySelector('.level-number');
const difficulty = document.querySelector('.difficulty');
const boardSlot = document.querySelector('.board-slot');
const overview = document.querySelector('.overview');
const overviewCount = document.querySelector('.overview-count');
const overviewSections = document.querySelector('.overview-sections');
const sheetLayer = document.querySelector('.sheet-layer');
const themeOptions = document.querySelectorAll('.theme-option');
const themeColor = document.querySelector('meta[name="theme-color"]');
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
const PHONE_SHORT_SIDE = 500;

let levels = [];
let levelIndex = 0;
let solvedIds = new Set();
let game = null;
let board = null;
let pieceElements = [];
let busy = false;
let gesture = null;
let pickedIndex = null;
let openLayer = null;
let theme = 'auto';
let turn = 0;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function slideMs(distance) {
  return reducedMotion() ? 120 : Math.min(180 + 40 * distance, 420);
}

function placeOnCell(element, cell) {
  const [row, col] = toRowCol(cell);
  element.style.setProperty('--row', row);
  element.style.setProperty('--col', col);
}

function createCellItem(className, color, cell) {
  const element = document.createElement('div');
  element.className = `cell-item ${className} ${color}`;
  placeOnCell(element, cell);
  return element;
}

function createTarget(piece, cell) {
  const target = createCellItem('target', piece.color, cell);
  const mark = document.createElement('div');
  mark.className = 'target-mark';
  target.append(mark);
  return target;
}

function createPiece(piece, cell) {
  const element = createCellItem('piece', piece.color, cell);
  const tile = document.createElement('div');
  tile.className = 'tile';
  if (piece.kind === 'goal') {
    const mark = document.createElement('div');
    mark.className = 'goal-mark';
    tile.append(mark);
  }
  element.append(tile);
  return element;
}

function createBoard() {
  const element = document.createElement('div');
  element.className = 'board';
  element.setAttribute('role', 'img');
  const goals = game.targets.filter((target) => target !== null).length;
  element.setAttribute('aria-label', `Puzzle board, 6 by 6, ${goals} to bring home`);

  game.pieces.forEach((piece, index) => {
    if (piece.kind === 'goal') element.append(createTarget(piece, game.targets[index]));
  });
  pieceElements = game.pieces.map((piece, index) => createPiece(piece, game.cells[index]));
  element.append(...pieceElements);
  return element;
}

function createDots(count) {
  return [1, 2, 3, 4, 5].map((dot) => {
    const element = document.createElement('div');
    element.className = dot <= count ? 'dot filled' : 'dot';
    return element;
  });
}

function renderHeader(level) {
  levelNumber.textContent = levelIndex + 1;
  difficulty.setAttribute('aria-label', `Difficulty ${level.difficulty} of 5`);
  difficulty.replaceChildren(...createDots(level.difficulty));
}

function openLevel(index, unfinished = null) {
  levelIndex = index;
  game = new Game(levels[index]);
  if (unfinished !== null && unfinished.levelId === levels[index].id) game.restore(unfinished);
  pickedIndex = null;
  screen.classList.remove('solved');
  renderHeader(levels[index]);
  board = createBoard();
  boardSlot.append(board);
  saveCurrent(levels[index].id);
}

// Keeps the unfinished level, so she comes back to where she was. Only the
// position and its undo steps are stored, and only until the level is left.
function saveProgress() {
  const level = levels[levelIndex];
  if (game.solved) {
    solvedIds.add(level.id);
    saveSolved(solvedIds);
    saveUnfinished(null);
    // If the app is closed before she taps Next, it opens at the next level.
    if (levelIndex < levels.length - 1) saveCurrent(levels[levelIndex + 1].id);
  } else {
    saveUnfinished({ levelId: level.id, ...game.snapshot() });
  }
}

function showSolved() {
  setPicked(null);
  game.pieces.forEach((piece, index) => {
    if (piece.kind === 'goal') pieceElements[index].firstChild.classList.add('halo');
  });
  board.classList.add('solved');
  screen.classList.add('solved');
}

// Moves every piece that changed to its current cell, all at once.
async function slideToPosition(previousCells) {
  let longest = 0;
  const moved = [];

  game.cells.forEach((cell, index) => {
    if (cell === previousCells[index]) return;
    const [row, col] = toRowCol(cell);
    const [previousRow, previousCol] = toRowCol(previousCells[index]);
    const ms = slideMs(Math.abs(row - previousRow) + Math.abs(col - previousCol));
    const element = pieceElements[index];
    element.style.transitionDuration = `${ms}ms`;
    placeOnCell(element, cell);
    moved.push(element);
    longest = Math.max(longest, ms);
  });

  busy = true;
  await wait(longest);
  moved.forEach((element) => { element.style.transitionDuration = ''; });
  busy = false;
}

async function nudge(index, direction) {
  if (reducedMotion()) return;
  const [x, y] = NUDGE_OFFSETS[direction];
  busy = true;
  pieceElements[index].firstChild.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${x}px, ${y}px)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: NUDGE_MS, easing: 'ease-out' },
  );
  await wait(NUDGE_MS);
  busy = false;
}

const canAct = () => game !== null && !busy && !game.solved && openLayer === null;

async function movePiece(index, direction) {
  if (!canAct()) return;
  const previousCells = game.cells;
  if (game.move(game.pieces[index].id, direction) === null) {
    await nudge(index, direction);
    return;
  }
  saveProgress();
  await slideToPosition(previousCells);
  if (game.solved) showSolved();
}

function undo() {
  if (!canAct()) return;
  const previousCells = game.cells;
  if (game.undo()) {
    saveProgress();
    slideToPosition(previousCells);
  }
}

function restart() {
  if (!canAct()) return;
  const previousCells = game.cells;
  if (game.restart()) {
    saveProgress();
    slideToPosition(previousCells);
  }
}

async function nextLevel() {
  if (game === null || busy || !game.solved || openLayer !== null) return;
  if (levelIndex === levels.length - 1) {
    showOverview();
    return;
  }

  const oldBoard = board;
  openLevel(levelIndex + 1);
  if (!reducedMotion()) {
    busy = true;
    oldBoard.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: CROSS_FADE_MS, fill: 'forwards' });
    board.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CROSS_FADE_MS });
    await wait(CROSS_FADE_MS);
    busy = false;
  }
  oldBoard.remove();
}

function chooseLevel(index) {
  closeLayer();
  if (index === levelIndex && !game.solved) return;
  saveUnfinished(null);
  board.remove();
  openLevel(index);
}

function createMarker(level, index, upNext) {
  const marker = document.createElement('button');
  const state = solvedIds.has(level.id) ? 'solved' : '';
  marker.className = `marker ${state} ${index === upNext ? 'up-next' : ''}`;
  const note = state === 'solved' ? ', solved' : (index === upNext ? ', next up' : '');
  marker.setAttribute('aria-label', `Level ${index + 1}${note}`);
  const circle = document.createElement('span');
  circle.className = 'marker-circle';
  marker.append(circle);
  onPress(marker, () => chooseLevel(index));
  return marker;
}

function createSection(rating, entries) {
  const section = document.createElement('div');
  section.className = 'overview-section';

  const heading = document.createElement('div');
  heading.className = 'section-heading';
  const dots = document.createElement('div');
  dots.className = 'difficulty';
  dots.setAttribute('role', 'img');
  dots.setAttribute('aria-label', `Difficulty ${rating} of 5`);
  dots.append(...createDots(rating));
  const rule = document.createElement('div');
  rule.className = 'section-rule';
  heading.append(dots, rule);

  const markers = document.createElement('div');
  markers.className = 'markers';
  markers.append(...entries);
  section.append(heading, markers);
  return section;
}

function showOverview() {
  const upNext = levels.findIndex((level) => !solvedIds.has(level.id));
  const solvedCount = levels.filter((level) => solvedIds.has(level.id)).length;
  overviewCount.textContent = `${solvedCount} of ${levels.length}`;

  const sections = [1, 2, 3, 4, 5].flatMap((rating) => {
    const entries = levels.flatMap((level, index) => (
      level.difficulty === rating ? [createMarker(level, index, upNext)] : []
    ));
    return entries.length > 0 ? [createSection(rating, entries)] : [];
  });
  overviewSections.replaceChildren(...sections);

  openLayer = overview;
  overview.classList.add('open');
  overview.querySelector('.up-next')?.scrollIntoView({ block: 'center' });
}

function showSheet() {
  if (!canAct()) return;
  setPicked(null);
  openLayer = sheetLayer;
  sheetLayer.classList.add('open');
}

function closeLayer() {
  if (openLayer === null) return;
  openLayer.classList.remove('open');
  openLayer = null;
}

function applyTheme() {
  const shown = theme === 'auto' ? (darkScheme.matches ? 'dusk' : 'paper') : theme;
  document.documentElement.dataset.theme = shown;
  themeColor.content = shown === 'dusk' ? '#212427' : '#F6F1E9';
  themeOptions.forEach((option) => {
    option.classList.toggle('chosen', option.dataset.themeOption === theme);
  });
}

function chooseTheme(choice) {
  theme = choice;
  saveTheme(choice);
  applyTheme();
}

// iOS has no way to lock the rotation of a web app, so a phone on its side gets
// the page turned back and the game stays where it was. Tablets rotate freely.
function applyTurn() {
  const angle = window.orientation ?? window.screen.orientation?.angle ?? 0;
  const sideways = angle === 90 || angle === -90 || angle === 270;
  const phone = Math.min(window.innerWidth, window.innerHeight) < PHONE_SHORT_SIDE;
  turn = sideways && phone ? (angle === 90 ? 90 : -90) : 0;
  if (turn === 0) delete document.documentElement.dataset.turn;
  else document.documentElement.dataset.turn = turn === 90 ? 'left' : 'right';
}

// A finger moves across the screen; the page may be turned against it.
function toPage(x, y) {
  if (turn === 90) return [-y, x];
  if (turn === -90) return [y, -x];
  return [x, y];
}

function pieceIndexAt(x, y) {
  const rect = boardSlot.getBoundingClientRect();
  const [fromCentreX, fromCentreY] = toPage(x - rect.left - rect.width / 2, y - rect.top - rect.height / 2);
  const row = Math.floor((fromCentreY / rect.height + 0.5) * BOARD_SIZE);
  const col = Math.floor((fromCentreX / rect.width + 0.5) * BOARD_SIZE);
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return -1;
  return game.cells.indexOf(row * BOARD_SIZE + col);
}

function swipeDirection(x, y) {
  const across = Math.abs(x);
  const along = Math.abs(y);
  if (Math.hypot(x, y) < SWIPE_DISTANCE) return null;
  if (Math.min(across, along) / Math.max(across, along) > DIAGONAL_LIMIT) return null;
  if (across > along) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

function onPointerDown(event) {
  setPicked(null);
  if (gesture !== null || !canAct()) return;
  const index = pieceIndexAt(event.clientX, event.clientY);
  if (index === -1) return;
  gesture = { pointerId: event.pointerId, index, x: event.clientX, y: event.clientY };
  boardSlot.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (gesture === null || event.pointerId !== gesture.pointerId) return;
  const direction = swipeDirection(...toPage(event.clientX - gesture.x, event.clientY - gesture.y));
  if (direction === null) return;
  const { index } = gesture;
  gesture = null;
  movePiece(index, direction);
}

function onPointerEnd(event) {
  if (gesture !== null && event.pointerId === gesture.pointerId) gesture = null;
}

// Keyboard picking is for testing on a computer; it never shows on the phone.
function setPicked(index) {
  if (pickedIndex !== null) pieceElements[pickedIndex].firstChild.classList.remove('halo');
  pickedIndex = index;
  if (pickedIndex !== null) pieceElements[pickedIndex].firstChild.classList.add('halo');
}

function onKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || game === null) return;
  const { key } = event;

  if (openLayer !== null) {
    if (key === 'Escape') closeLayer();
    return;
  }

  if (key === 'Enter') {
    event.preventDefault();
    nextLevel();
  } else if (key === 'z' || key === 'Z') {
    undo();
  } else if (key === 'r' || key === 'R') {
    restart();
  } else if (key === 'Tab') {
    event.preventDefault();
    if (game.solved) return;
    const count = game.pieces.length;
    const step = event.shiftKey ? count - 1 : 1;
    setPicked(((pickedIndex ?? (event.shiftKey ? 0 : -1)) + step) % count);
  } else if (key >= '1' && key <= '9') {
    if (!game.solved && Number(key) <= game.pieces.length) setPicked(Number(key) - 1);
  } else if (ARROW_KEYS[key] !== undefined) {
    event.preventDefault();
    if (pickedIndex !== null) movePiece(pickedIndex, ARROW_KEYS[key]);
  }
}

// Listens for pointerup, not click: a browser can drop the click of a tap that
// comes right after a swipe, and a button must never ignore her.
function onPress(button, action) {
  button.addEventListener('pointerup', (event) => {
    const rect = button.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (inside) action();
  });
}

// iOS ignores user-scalable=no, so pinching has to be stopped by hand.
function blockPageGestures() {
  const stop = (event) => event.preventDefault();
  ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu'].forEach((type) => {
    document.addEventListener(type, stop, { passive: false });
  });
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });
}

async function start() {
  navigator.serviceWorker?.register('sw.js').catch(() => {});
  blockPageGestures();
  applyTurn();
  window.addEventListener('resize', applyTurn);
  window.addEventListener('orientationchange', applyTurn);
  theme = loadTheme();
  applyTheme();
  darkScheme.addEventListener('change', applyTheme);

  boardSlot.addEventListener('pointerdown', onPointerDown);
  boardSlot.addEventListener('pointermove', onPointerMove);
  boardSlot.addEventListener('pointerup', onPointerEnd);
  boardSlot.addEventListener('pointercancel', onPointerEnd);
  document.addEventListener('keydown', onKeyDown);

  onPress(document.querySelector('#undo'), undo);
  onPress(document.querySelector('#restart'), restart);
  onPress(document.querySelector('#menu'), showSheet);
  onPress(document.querySelector('#next'), nextLevel);
  onPress(document.querySelector('#overview-back'), closeLayer);
  onPress(document.querySelector('#sheet-levels'), () => {
    closeLayer();
    showOverview();
  });
  themeOptions.forEach((option) => {
    onPress(option, () => chooseTheme(option.dataset.themeOption));
  });
  sheetLayer.addEventListener('pointerup', (event) => {
    if (event.target === sheetLayer) closeLayer();
  });

  const response = await fetch('levels/levels.json');
  levels = playableLevels(await response.json());
  if (levels.length === 0) return;

  solvedIds = loadSolved();
  const savedIndex = levels.findIndex((level) => level.id === loadCurrent());
  openLevel(Math.max(savedIndex, 0), loadUnfinished());
}

start();
