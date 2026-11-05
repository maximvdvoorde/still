// Progress on this device. Every access can fail (private mode, blocked
// storage), and the game must keep running if it does.

const SOLVED_KEY = 'still.solved';
const CURRENT_KEY = 'still.current';
const UNFINISHED_KEY = 'still.unfinished';
const THEME_KEY = 'still.theme';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Progress just isn't kept this time.
  }
}

function readJson(key) {
  try {
    return JSON.parse(read(key));
  } catch {
    return null;
  }
}

export function loadSolved() {
  const ids = readJson(SOLVED_KEY);
  return new Set(Array.isArray(ids) ? ids : []);
}

export function saveSolved(ids) {
  write(SOLVED_KEY, JSON.stringify([...ids]));
}

export function loadCurrent() {
  return read(CURRENT_KEY);
}

export function saveCurrent(id) {
  write(CURRENT_KEY, id);
}

export function loadUnfinished() {
  return readJson(UNFINISHED_KEY);
}

export function saveUnfinished(unfinished) {
  write(UNFINISHED_KEY, unfinished === null ? null : JSON.stringify(unfinished));
}

export function loadTheme() {
  const theme = read(THEME_KEY);
  return theme === 'paper' || theme === 'dusk' ? theme : 'auto';
}

export function saveTheme(theme) {
  write(THEME_KEY, theme === 'auto' ? null : theme);
}
