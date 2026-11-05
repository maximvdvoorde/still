import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIRECTIONS, Game, isSolved, readLevel, slide, validateLevel } from '../src/engine.js';
import { solve } from '../src/solver.js';

const goal = (id, pos, target, color = 'terracotta') => ({ id, kind: 'goal', color, pos, target });
const helper = (id, pos, color = 'ochre') => ({ id, kind: 'helper', color, pos });
const level = (...pieces) => ({ id: 'test', difficulty: 1, pieces });

function replay(testLevel, solution) {
  const game = new Game(testLevel);
  for (const move of solution) {
    assert.ok(game.move(move.piece, move.direction), `${move.piece} ${move.direction} is not allowed`);
  }
  return game;
}

// The plainest possible search: every helper keeps its identity, no shortcuts.
function bruteForce(testLevel) {
  const { cells, targets } = readLevel(testLevel);
  const seen = new Set([cells.join()]);
  let layer = new Map([[cells.join(), { cells, paths: 1 }]]);
  for (let depth = 1; layer.size > 0; depth += 1) {
    const next = new Map();
    for (const { cells: current, paths } of layer.values()) {
      for (let index = 0; index < current.length; index += 1) {
        for (const direction of DIRECTIONS) {
          const to = slide(current, index, direction);
          if (to === -1) continue;
          const moved = current.with(index, to);
          const key = moved.join();
          if (seen.has(key)) continue;
          const entry = next.get(key) ?? { cells: moved, paths: 0 };
          entry.paths += paths;
          next.set(key, entry);
        }
      }
    }
    for (const key of next.keys()) seen.add(key);
    const solved = [...next.values()].filter((entry) => isSolved(entry.cells, targets));
    if (solved.length > 0) {
      return { minMoves: depth, solutionCount: solved.reduce((total, entry) => total + entry.paths, 0) };
    }
    layer = next;
  }
  return { minMoves: null, solutionCount: 0 };
}

describe('solve', () => {
  test('finds a one-move solution', () => {
    const result = solve(level(goal('g1', [5, 1], [1, 1]), helper('h1', [0, 1])));
    assert.equal(result.status, 'solvable');
    assert.equal(result.minMoves, 1);
    assert.deepEqual(result.solution, [{ piece: 'g1', direction: 'up' }]);
    assert.equal(result.solutionCount, 1);
  });

  test('finds a solution that needs a helper moved first', () => {
    // h1 must stop at [0, 1], against h2, before g1 can stop on [1, 1].
    const testLevel = level(
      goal('g1', [5, 1], [1, 1]),
      helper('h1', [0, 5]),
      helper('h2', [0, 0], 'sage'),
    );
    const result = solve(testLevel);
    assert.equal(result.minMoves, 2);
    assert.deepEqual(result.solution, [
      { piece: 'h1', direction: 'left' },
      { piece: 'g1', direction: 'up' },
    ]);
  });

  test('counts move orders as separate shortest solutions', () => {
    const result = solve(level(
      goal('g1', [5, 1], [1, 1]),
      goal('g2', [5, 4], [1, 4], 'blue'),
      helper('h1', [0, 1]),
      helper('h2', [0, 4], 'sage'),
    ));
    assert.equal(result.minMoves, 2);
    assert.equal(result.solutionCount, 2);
  });

  test('rejects an unsolvable level: the example board from the spec', () => {
    const result = solve(level(
      goal('g1', [5, 1], [1, 1]),
      goal('g2', [0, 4], [3, 4], 'blue'),
      helper('h1', [0, 0]),
      helper('h2', [2, 5], 'plum'),
      helper('h3', [4, 3], 'sage'),
    ));
    assert.equal(result.status, 'unsolvable');
    assert.equal(result.minMoves, null);
    assert.equal(result.solution, null);
    assert.equal(result.states, 9);
  });

  test('rejects a level where nothing can move', () => {
    const result = solve(level(goal('g1', [0, 0], [3, 3]), helper('h1', [5, 5])));
    assert.equal(result.status, 'unsolvable');
    assert.equal(result.states, 1);
  });

  test('reports unknown instead of hanging when the cap is reached', () => {
    const big = level(
      goal('g1', [0, 0], [5, 5]),
      goal('g2', [0, 5], [5, 0], 'blue'),
      helper('h1', [2, 0]),
      helper('h2', [2, 5], 'sage'),
      helper('h3', [3, 2], 'plum'),
    );
    const result = solve(big, 3);
    assert.equal(result.status, 'unknown');
    assert.equal(result.minMoves, null);
    assert.ok(result.states <= 3);
  });

  test('treats helpers as interchangeable, however the level lists them', () => {
    const pieces = [
      helper('h1', [0, 2]),
      goal('g1', [5, 1], [1, 2]),
      helper('h2', [5, 2], 'sage'),
      helper('h3', [1, 5], 'plum'),
    ];
    const reversed = [...pieces].reverse();
    assert.equal(solve(level(...pieces)).minMoves, solve(level(...reversed)).minMoves);
    assert.equal(solve(level(...pieces)).states, solve(level(...reversed)).states);
  });

  test('agrees with a plain search on 300 random levels, and its solutions replay', () => {
    let seed = 20261105;
    const random = (limit) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.floor((seed / 2 ** 32) * limit);
    };
    const cell = () => [random(6), random(6)];
    const colours = ['terracotta', 'blue', 'rose'];
    let solvable = 0;
    let checked = 0;

    while (checked < 300) {
      const goals = 1 + random(2);
      const helpers = 2 + random(3);
      const pieces = [];
      for (let i = 0; i < goals; i += 1) pieces.push(goal(`g${i}`, cell(), cell(), colours[i]));
      for (let i = 0; i < helpers; i += 1) pieces.push(helper(`h${i}`, cell()));
      const testLevel = level(...pieces);
      if (validateLevel(testLevel).length > 0) continue;
      checked += 1;

      const result = solve(testLevel);
      const expected = bruteForce(testLevel);
      assert.equal(result.minMoves, expected.minMoves);
      assert.equal(result.solutionCount, expected.solutionCount);

      if (result.status === 'solvable') {
        solvable += 1;
        const game = replay(testLevel, result.solution);
        assert.equal(game.solved, true);
        assert.equal(game.moves, result.minMoves);
      }
    }
    assert.ok(solvable > 0, 'no random level was solvable, so nothing was compared');
  });
});

describe('levels/levels.json', () => {
  const { levels } = JSON.parse(readFileSync(new URL('../levels/levels.json', import.meta.url), 'utf8'));

  test('has unique ids and order values', () => {
    assert.equal(new Set(levels.map((entry) => entry.id)).size, levels.length);
    assert.equal(new Set(levels.map((entry) => entry.order)).size, levels.length);
  });

  for (const entry of levels) {
    test(`${entry.id} is valid and its minMoves is what the solver finds`, () => {
      assert.deepEqual(validateLevel(entry), []);
      const result = solve(entry);
      assert.equal(result.status, 'solvable');
      assert.equal(result.minMoves, entry.minMoves);
      assert.equal(replay(entry, result.solution).solved, true);
    });
  }
});
