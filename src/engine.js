// Rules of Still: board state, moves, win check. No DOM code, so the solver,
// tests and the later generator can reuse it.
//
// A cell is one number, row * 6 + col. A position is an array of cells, one
// per piece, in the same order as the level's pieces.

export const BOARD_SIZE = 6;
export const DIRECTIONS = ['up', 'down', 'left', 'right'];

const STEPS = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

const PIECE_COLORS = ['terracotta', 'blue', 'rose', 'ochre', 'sage', 'plum'];

export function toCell([row, col]) {
  return row * BOARD_SIZE + col;
}

export function toRowCol(cell) {
  return [Math.floor(cell / BOARD_SIZE), cell % BOARD_SIZE];
}

function isOnBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// Returns the cell the piece stops on, or -1 if the move is not allowed: no
// piece to stop against before the edge, or a piece right next to it.
export function slide(cells, index, direction) {
  const [rowStep, colStep] = STEPS[direction];
  let [row, col] = toRowCol(cells[index]);
  let distance = 0;

  while (true) {
    const nextRow = row + rowStep;
    const nextCol = col + colStep;
    if (!isOnBoard(nextRow, nextCol)) return -1;
    if (cells.includes(nextRow * BOARD_SIZE + nextCol)) {
      return distance > 0 ? row * BOARD_SIZE + col : -1;
    }
    row = nextRow;
    col = nextCol;
    distance += 1;
  }
}

// `targets` holds one entry per piece: the goal's target cell, or null for a helper.
export function isSolved(cells, targets) {
  return targets.every((target, index) => target === null || cells[index] === target);
}

// Turns a level from levels.json into the numbers the rules work with.
export function readLevel(level) {
  return {
    cells: level.pieces.map((piece) => toCell(piece.pos)),
    targets: level.pieces.map((piece) => (piece.kind === 'goal' ? toCell(piece.target) : null)),
  };
}

// Returns a list of problems; an empty list means the level is playable.
// Solvability is not checked here: that is the solver's job, before a level is added.
export function validateLevel(level) {
  const problems = [];
  const pieces = Array.isArray(level.pieces) ? level.pieces : [];
  const goals = pieces.filter((piece) => piece.kind === 'goal');
  const helpers = pieces.filter((piece) => piece.kind === 'helper');

  if (typeof level.id !== 'string' || level.id === '') problems.push('level has no id');
  if (goals.length < 1 || goals.length > 3) problems.push('needs 1-3 goal pieces');
  if (helpers.length < 1 || helpers.length > 5) problems.push('needs 1-5 helper pieces');
  if (goals.length + helpers.length !== pieces.length) problems.push('unknown piece kind');
  if (!Number.isInteger(level.difficulty) || level.difficulty < 1 || level.difficulty > 5) {
    problems.push('difficulty must be 1-5');
  }

  const isValidPos = (pos) =>
    Array.isArray(pos) && pos.length === 2 && pos.every(Number.isInteger) && isOnBoard(pos[0], pos[1]);

  for (const piece of pieces) {
    if (!isValidPos(piece.pos)) problems.push(`${piece.id}: position is outside the board`);
    if (!PIECE_COLORS.includes(piece.color)) problems.push(`${piece.id}: unknown colour`);
    if (piece.kind === 'goal' && !isValidPos(piece.target)) {
      problems.push(`${piece.id}: target is outside the board`);
    }
    if (piece.kind === 'helper' && piece.target !== undefined) {
      problems.push(`${piece.id}: helpers have no target`);
    }
  }
  if (problems.length > 0) return problems;

  const hasDuplicates = (values) => new Set(values).size !== values.length;
  const { cells, targets } = readLevel(level);

  if (hasDuplicates(pieces.map((piece) => piece.id))) problems.push('piece ids are not unique');
  if (hasDuplicates(cells)) problems.push('two pieces share a cell');
  if (hasDuplicates(targets.filter((target) => target !== null))) problems.push('two targets share a cell');
  if (hasDuplicates(goals.map((piece) => piece.color))) problems.push('two goal pieces share a colour');
  if (isSolved(cells, targets)) problems.push('goal pieces already on their targets');

  return problems;
}

// The levels the game can show, in order. Invalid ones are skipped and logged.
export function playableLevels(file) {
  const seenIds = new Set();
  const levels = file.levels.filter((level) => {
    if (level.status !== 'approved') return false;
    const problems = validateLevel(level);
    if (seenIds.has(level.id)) problems.push('level id is not unique');
    seenIds.add(level.id);
    if (problems.length > 0) console.warn(`Skipping level ${level.id}: ${problems.join('; ')}`);
    return problems.length === 0;
  });
  return levels.sort((first, second) => first.order - second.order);
}

// One level being played: the current position plus its undo history.
export class Game {
  constructor(level) {
    const { cells, targets } = readLevel(level);
    this.pieces = level.pieces;
    this.targets = targets;
    this.startCells = cells;
    this.cells = cells;
    this.moves = 0;
    this.history = [];
  }

  get solved() {
    return isSolved(this.cells, this.targets);
  }

  // Returns the piece's old and new cell, or null if the move is not allowed.
  // A move that is not allowed changes nothing: no count, no undo step.
  move(pieceId, direction) {
    const index = this.pieces.findIndex((piece) => piece.id === pieceId);
    const to = slide(this.cells, index, direction);
    if (to === -1) return null;

    const from = this.cells[index];
    this.remember();
    this.cells = this.cells.with(index, to);
    this.moves += 1;
    return { from, to };
  }

  // Steps back one move, or out of a restart. Returns false with nothing to undo.
  undo() {
    const previous = this.history.pop();
    if (previous === undefined) return false;
    this.cells = previous.cells;
    this.moves = previous.moves;
    return true;
  }

  // Returns false if the level is already at its start position.
  restart() {
    if (this.cells.every((cell, index) => cell === this.startCells[index])) return false;
    this.remember();
    this.cells = this.startCells;
    this.moves = 0;
    return true;
  }

  remember() {
    this.history.push({ cells: this.cells, moves: this.moves });
  }

  // Plain data for picking the level up again later.
  snapshot() {
    return { start: this.startCells, cells: this.cells, moves: this.moves, history: this.history };
  }

  // Returns false, changing nothing, if the snapshot does not fit this level.
  restore(snapshot) {
    const fits = (cells) => Array.isArray(cells)
      && cells.length === this.startCells.length
      && new Set(cells).size === cells.length
      && cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < BOARD_SIZE * BOARD_SIZE);
    const isStart = (cells) => cells.every((cell, index) => cell === this.startCells[index]);

    const { start, cells, moves, history } = snapshot;
    if (!fits(start) || !isStart(start) || !fits(cells) || !Number.isInteger(moves)) return false;
    if (!Array.isArray(history) || !history.every((step) => fits(step.cells) && Number.isInteger(step.moves))) return false;
    if (isSolved(cells, this.targets)) return false;

    this.cells = cells;
    this.moves = moves;
    this.history = history;
    return true;
  }
}
