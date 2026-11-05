import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SIZE, Game, isSolved, playableLevels, slide, toCell, toRowCol, validateLevel } from '../src/engine.js';

const goal = (id, pos, target, color = 'terracotta') => ({ id, kind: 'goal', color, pos, target });
const helper = (id, pos, color = 'ochre') => ({ id, kind: 'helper', color, pos });
const level = (...pieces) => ({ id: 'test', difficulty: 1, pieces });

const cellOf = (game, id) => toRowCol(game.cells[game.pieces.findIndex((piece) => piece.id === id)]);

describe('board', () => {
  test('is 6 by 6', () => {
    assert.equal(BOARD_SIZE, 6);
  });

  test('row 0 is the top and coordinates survive the round trip', () => {
    assert.equal(toCell([0, 0]), 0);
    assert.equal(toCell([5, 5]), 35);
    assert.deepEqual(toRowCol(toCell([2, 4])), [2, 4]);
  });
});

describe('moving', () => {
  test('slides until the cell before another piece, in all four directions', () => {
    const cases = [
      ['up', [5, 2], [0, 2], [1, 2]],
      ['down', [0, 2], [5, 2], [4, 2]],
      ['left', [3, 5], [3, 0], [3, 1]],
      ['right', [3, 0], [3, 5], [3, 4]],
    ];
    for (const [direction, from, blocker, stop] of cases) {
      const cells = [toCell(from), toCell(blocker)];
      assert.equal(slide(cells, 0, direction), toCell(stop), direction);
    }
  });

  test('stops against the nearest piece when several are in line', () => {
    const cells = [toCell([3, 0]), toCell([3, 5]), toCell([3, 3])];
    assert.equal(slide(cells, 0, 'right'), toCell([3, 2]));
  });

  test('ignores pieces that are not in its line', () => {
    const cells = [toCell([3, 0]), toCell([2, 4]), toCell([3, 4])];
    assert.equal(slide(cells, 0, 'right'), toCell([3, 3]));
  });

  test('is not allowed with no piece before the edge, in all four directions', () => {
    for (const direction of ['up', 'down', 'left', 'right']) {
      const cells = [toCell([2, 2]), toCell([4, 5])];
      assert.equal(slide(cells, 0, direction), -1, direction);
    }
  });

  test('is not allowed from the edge, off the board', () => {
    assert.equal(slide([toCell([0, 3]), toCell([5, 3])], 0, 'up'), -1);
    assert.equal(slide([toCell([3, 5]), toCell([3, 0])], 0, 'right'), -1);
  });

  test('does not wrap around the end of a row', () => {
    assert.equal(slide([toCell([2, 5]), toCell([3, 1])], 0, 'right'), -1);
    assert.equal(slide([toCell([3, 0]), toCell([2, 4])], 0, 'left'), -1);
  });

  test('zero distance is not allowed when the neighbouring cell is occupied', () => {
    const cells = [toCell([3, 3]), toCell([3, 4]), toCell([2, 3])];
    assert.equal(slide(cells, 0, 'right'), -1);
    assert.equal(slide(cells, 0, 'up'), -1);
  });

  test('goal pieces and helpers both move, one piece per move', () => {
    const game = new Game(level(
      goal('g1', [5, 0], [1, 1]),
      helper('h1', [0, 0]),
      helper('h2', [0, 5]),
    ));

    assert.deepEqual(game.move('g1', 'up'), { from: toCell([5, 0]), to: toCell([1, 0]) });
    assert.deepEqual(game.move('h2', 'left'), { from: toCell([0, 5]), to: toCell([0, 1]) });
    assert.deepEqual(cellOf(game, 'g1'), [1, 0]);
    assert.deepEqual(cellOf(game, 'h1'), [0, 0]);
    assert.deepEqual(cellOf(game, 'h2'), [0, 1]);
  });

  test('targets never block: a piece slides over any target', () => {
    const game = new Game(level(
      goal('g1', [3, 0], [3, 2]),
      goal('g2', [5, 5], [0, 0], 'blue'),
      helper('h1', [3, 5]),
    ));

    game.move('g1', 'right');
    assert.deepEqual(cellOf(game, 'g1'), [3, 4]);
  });

  test('any piece may stop on any target', () => {
    const game = new Game(level(
      goal('g1', [5, 5], [3, 2]),
      helper('h1', [3, 0]),
      helper('h2', [3, 3]),
    ));

    game.move('h1', 'right');
    assert.deepEqual(cellOf(game, 'h1'), [3, 2]);
    assert.equal(game.solved, false);
  });
});

describe('winning', () => {
  test('a single goal piece on its target solves the level', () => {
    const game = new Game(level(goal('g1', [5, 1], [1, 1]), helper('h1', [0, 1])));
    assert.equal(game.solved, false);
    game.move('g1', 'up');
    assert.equal(game.solved, true);
  });

  test('every goal piece must be on its own target at the same time', () => {
    const game = new Game(level(
      goal('g1', [5, 1], [1, 1]),
      goal('g2', [5, 4], [1, 4], 'blue'),
      helper('h1', [0, 1]),
      helper('h2', [0, 4]),
    ));

    game.move('g1', 'up');
    assert.equal(game.solved, false);
    game.move('g2', 'up');
    assert.equal(game.solved, true);
  });

  test('a goal piece on the other goal piece\'s target does not count', () => {
    const targets = [toCell([1, 1]), toCell([3, 4])];
    assert.equal(isSolved([toCell([3, 4]), toCell([1, 1])], targets), false);
    assert.equal(isSolved([toCell([1, 1]), toCell([3, 4])], targets), true);
  });

  test('helpers play no part in the win check', () => {
    assert.equal(isSolved([toCell([1, 1]), toCell([0, 0])], [toCell([1, 1]), null]), true);
    assert.equal(isSolved([toCell([1, 1]), toCell([4, 4])], [toCell([1, 1]), null]), true);
  });

  test('a goal piece on its target is not locked and can leave again', () => {
    const game = new Game(level(
      goal('g1', [5, 1], [1, 1]),
      goal('g2', [4, 3], [2, 2], 'blue'),
      helper('h1', [0, 1]),
      helper('h2', [1, 5]),
    ));

    game.move('g1', 'up');
    assert.deepEqual(cellOf(game, 'g1'), [1, 1]);
    assert.deepEqual(game.move('g1', 'right'), { from: toCell([1, 1]), to: toCell([1, 4]) });
    assert.deepEqual(cellOf(game, 'g1'), [1, 4]);
    assert.equal(game.solved, false);
  });

  test('a solved level becomes unsolved if a goal piece leaves', () => {
    const game = new Game(level(
      goal('g1', [5, 1], [1, 1]),
      helper('h1', [0, 1]),
      helper('h2', [1, 5]),
    ));

    game.move('g1', 'up');
    assert.equal(game.solved, true);
    game.move('g1', 'right');
    assert.equal(game.solved, false);
  });
});

describe('counting and undo', () => {
  const start = () => new Game(level(
    goal('g1', [5, 1], [1, 1]),
    helper('h1', [0, 1]),
    helper('h2', [1, 5]),
    helper('h3', [1, 0]),
  ));

  test('each allowed move counts as one move, whatever its distance', () => {
    const game = start();
    game.move('g1', 'up');
    assert.equal(game.moves, 1);
    game.move('g1', 'right');
    assert.equal(game.moves, 2);
  });

  test('a move off the board changes nothing: no count, no undo step', () => {
    const game = start();
    assert.equal(game.move('g1', 'left'), null);
    assert.equal(game.moves, 0);
    assert.equal(game.history.length, 0);
    assert.deepEqual(cellOf(game, 'g1'), [5, 1]);
  });

  test('a zero-distance move changes nothing: no count, no undo step', () => {
    const game = new Game(level(goal('g1', [3, 3], [1, 1]), helper('h1', [3, 4])));
    assert.equal(game.move('g1', 'right'), null);
    assert.equal(game.moves, 0);
    assert.equal(game.history.length, 0);
  });

  test('undo steps back one move at a time, all the way to the start', () => {
    const game = start();
    game.move('g1', 'up');
    game.move('g1', 'right');
    game.move('h3', 'right');

    assert.equal(game.undo(), true);
    assert.deepEqual(cellOf(game, 'h3'), [1, 0]);
    assert.equal(game.undo(), true);
    assert.deepEqual(cellOf(game, 'g1'), [1, 1]);
    assert.equal(game.undo(), true);
    assert.deepEqual(cellOf(game, 'g1'), [5, 1]);
    assert.equal(game.moves, 0);
    assert.equal(game.undo(), false);
  });

  test('undo has no limit', () => {
    const game = start();
    game.move('g1', 'up');
    for (let i = 0; i < 500; i += 1) {
      assert.ok(game.move('g1', i % 2 === 0 ? 'right' : 'left'));
    }
    assert.equal(game.moves, 501);
    while (game.undo());
    assert.equal(game.moves, 0);
    assert.deepEqual(game.cells, game.startCells);
  });

  test('restart returns every piece to its start position', () => {
    const game = start();
    game.move('g1', 'up');
    game.move('h2', 'left');

    assert.equal(game.restart(), true);
    assert.deepEqual(game.cells, game.startCells);
    assert.equal(game.moves, 0);
  });

  test('undo after a restart brings back the position before it', () => {
    const game = start();
    game.move('g1', 'up');
    game.move('h2', 'left');
    const before = game.cells;
    game.restart();

    assert.equal(game.undo(), true);
    assert.deepEqual(game.cells, before);
    assert.equal(game.moves, 2);

    game.undo();
    game.undo();
    assert.deepEqual(game.cells, game.startCells);
    assert.equal(game.undo(), false);
  });

  test('restart at the start position does nothing and adds no undo step', () => {
    const game = start();
    assert.equal(game.restart(), false);
    assert.equal(game.history.length, 0);
  });

  test('moves can continue after undo and restart', () => {
    const game = start();
    game.move('g1', 'up');
    game.undo();
    game.move('g1', 'up');
    assert.equal(game.solved, true);
    game.restart();
    game.move('g1', 'up');
    assert.equal(game.solved, true);
  });
});

describe('snapshot and restore', () => {
  const testLevel = () => level(
    goal('g1', [5, 1], [1, 1]),
    helper('h1', [0, 1]),
    helper('h2', [1, 5]),
    helper('h3', [1, 0]),
  );
  const saved = (game) => JSON.parse(JSON.stringify(game.snapshot()));

  test('brings back the position and the whole undo history, through JSON', () => {
    const game = new Game(testLevel());
    game.move('h2', 'left');
    game.move('g1', 'up');
    game.restart();

    const resumed = new Game(testLevel());
    assert.equal(resumed.restore(saved(game)), true);
    assert.deepEqual(resumed.cells, game.startCells);

    resumed.undo();
    assert.deepEqual(cellOf(resumed, 'g1'), [2, 1]);
    resumed.undo();
    resumed.undo();
    assert.deepEqual(resumed.cells, resumed.startCells);
    assert.equal(resumed.undo(), false);
  });

  test('refuses a snapshot from a level whose start has changed', () => {
    const game = new Game(testLevel());
    game.move('h2', 'left');

    const changed = testLevel();
    changed.pieces[3].pos = [2, 0];
    const resumed = new Game(changed);
    assert.equal(resumed.restore(saved(game)), false);
    assert.deepEqual(resumed.cells, resumed.startCells);
  });

  test('refuses damaged snapshots and solved positions', () => {
    const fresh = () => new Game(testLevel());
    const good = saved(fresh());
    assert.equal(fresh().restore({ ...good, cells: [1, 1, 2, 3] }), false);
    assert.equal(fresh().restore({ ...good, cells: [99, 1, 2, 3] }), false);
    assert.equal(fresh().restore({ ...good, cells: 'nonsense' }), false);
    assert.equal(fresh().restore({ ...good, history: [{ cells: [1], moves: 0 }] }), false);
    assert.equal(fresh().restore({ ...good, moves: 'many' }), false);

    const solved = fresh();
    solved.move('g1', 'up');
    assert.equal(fresh().restore(saved(solved)), false);
  });
});

describe('validateLevel', () => {
  const good = () => level(goal('g1', [5, 1], [1, 1]), helper('h1', [0, 1]));

  test('accepts a well-formed level', () => {
    assert.deepEqual(validateLevel(good()), []);
  });

  test('accepts the largest allowed level', () => {
    const pieces = [
      goal('g1', [0, 0], [1, 0]),
      goal('g2', [0, 1], [1, 1], 'blue'),
      goal('g3', [0, 2], [1, 2], 'rose'),
      helper('h1', [5, 0]),
      helper('h2', [5, 1], 'sage'),
      helper('h3', [5, 2], 'plum'),
      helper('h4', [5, 3]),
      helper('h5', [5, 4], 'sage'),
    ];
    assert.deepEqual(validateLevel(level(...pieces)), []);
  });

  test('a piece may start on a target as long as not all goals are home', () => {
    const start = level(
      goal('g1', [1, 1], [1, 1]),
      goal('g2', [5, 5], [2, 2], 'blue'),
      helper('h1', [0, 0]),
    );
    assert.deepEqual(validateLevel(start), []);
  });

  const rejects = (name, make, problem) => test(`rejects ${name}`, () => {
    assert.ok(validateLevel(make()).includes(problem), validateLevel(make()).join('; '));
  });

  rejects('a piece outside the board',
    () => level(goal('g1', [6, 1], [1, 1]), helper('h1', [0, 1])),
    'g1: position is outside the board');
  rejects('a target outside the board',
    () => level(goal('g1', [5, 1], [1, -1]), helper('h1', [0, 1])),
    'g1: target is outside the board');
  rejects('overlapping pieces',
    () => level(goal('g1', [0, 1], [1, 1]), helper('h1', [0, 1])),
    'two pieces share a cell');
  rejects('two targets on one cell',
    () => level(goal('g1', [5, 1], [1, 1]), goal('g2', [5, 2], [1, 1], 'blue'), helper('h1', [0, 1])),
    'two targets share a cell');
  rejects('all goal pieces already home',
    () => level(goal('g1', [1, 1], [1, 1]), helper('h1', [0, 1])),
    'goal pieces already on their targets');
  rejects('no goal piece',
    () => level(helper('h1', [0, 1])),
    'needs 1-3 goal pieces');
  rejects('four goal pieces',
    () => level(
      goal('g1', [0, 0], [1, 0]),
      goal('g2', [0, 1], [1, 1], 'blue'),
      goal('g3', [0, 2], [1, 2], 'rose'),
      goal('g4', [0, 3], [1, 3], 'plum'),
      helper('h1', [5, 0]),
    ),
    'needs 1-3 goal pieces');
  rejects('no helper',
    () => level(goal('g1', [5, 1], [1, 1])),
    'needs 1-5 helper pieces');
  rejects('six helpers',
    () => level(goal('g1', [0, 0], [1, 0]), ...[0, 1, 2, 3, 4, 5].map((col) => helper(`h${col}`, [5, col]))),
    'needs 1-5 helper pieces');
  rejects('a helper with a target',
    () => level(goal('g1', [5, 1], [1, 1]), { ...helper('h1', [0, 1]), target: [2, 2] }),
    'h1: helpers have no target');
  rejects('duplicate piece ids',
    () => level(goal('g1', [5, 1], [1, 1]), helper('g1', [0, 1])),
    'piece ids are not unique');
  rejects('two goal pieces in one colour',
    () => level(goal('g1', [5, 1], [1, 1]), goal('g2', [5, 2], [1, 2]), helper('h1', [0, 1])),
    'two goal pieces share a colour');
  rejects('an unknown colour',
    () => level(goal('g1', [5, 1], [1, 1], 'green'), helper('h1', [0, 1])),
    'g1: unknown colour');
  rejects('a difficulty outside 1-5',
    () => ({ ...good(), difficulty: 6 }),
    'difficulty must be 1-5');
});

describe('playableLevels', () => {
  const entry = (id, order, status = 'approved') => ({ ...level(goal('g1', [5, 1], [1, 1]), helper('h1', [0, 1])), id, order, status });

  test('keeps approved levels only, sorted by order', () => {
    const file = { levels: [entry('c', 3), entry('a', 1), entry('draft', 0, 'draft'), entry('no', 2, 'rejected')] };
    assert.deepEqual(playableLevels(file).map((item) => item.id), ['a', 'c']);
  });

  test('skips invalid levels and logs them', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const broken = { ...entry('broken', 2), difficulty: 9 };
    const file = { levels: [entry('a', 1), broken, entry('a', 3)] };

    assert.deepEqual(playableLevels(file).map((item) => item.id), ['a']);
    assert.equal(warn.mock.callCount(), 2);
    assert.match(warn.mock.calls[0].arguments[0], /broken/);
  });
});
