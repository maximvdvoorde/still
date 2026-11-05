// Breadth-first solver, built on the same move rules as the game. No DOM code
// and no Node code, so the later level manager can run it in a browser too.

import { BOARD_SIZE, DIRECTIONS, isSolved, readLevel, slide } from './engine.js';

export const MAX_STATES = 2_000_000;

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

// Helpers are interchangeable, so positions that differ only in which helper
// stands where share one key. Eight pieces of 36 cells fit exactly in a number.
function stateKey(cells, targets) {
  let key = 0;
  const helpers = [];
  for (let index = 0; index < cells.length; index += 1) {
    if (targets[index] === null) helpers.push(cells[index]);
    else key = key * CELL_COUNT + cells[index];
  }
  helpers.sort((a, b) => a - b);
  for (const cell of helpers) key = key * CELL_COUNT + cell;
  return key;
}

function pathTo(node, pieces) {
  const moves = [];
  for (let step = node; step.parent !== null; step = step.parent) {
    moves.push({ piece: pieces[step.index].id, direction: step.direction });
  }
  return moves.reverse();
}

// Returns { status, minMoves, solution, solutionCount, states }.
// status is 'solvable', 'unsolvable', or 'unknown' if the search hit maxStates.
// solutionCount counts move sequences, so the same moves in another order count again.
export function solve(level, maxStates = MAX_STATES) {
  const { cells, targets } = readLevel(level);
  const start = { cells, parent: null, index: -1, direction: null, depth: 0, paths: 1 };
  const seen = new Map([[stateKey(cells, targets), start]]);
  const result = (status, fields) => ({
    status, minMoves: null, solution: null, solutionCount: 0, states: seen.size, ...fields,
  });

  if (isSolved(cells, targets)) {
    return result('solvable', { minMoves: 0, solution: [], solutionCount: 1 });
  }

  let layer = [start];
  while (layer.length > 0) {
    const nextLayer = [];
    const solved = [];

    for (const node of layer) {
      for (let index = 0; index < cells.length; index += 1) {
        for (const direction of DIRECTIONS) {
          const to = slide(node.cells, index, direction);
          if (to === -1) continue;

          const nextCells = node.cells.with(index, to);
          const key = stateKey(nextCells, targets);
          const known = seen.get(key);
          if (known !== undefined) {
            if (known.depth === node.depth + 1) known.paths += node.paths;
            continue;
          }
          if (seen.size >= maxStates) return result('unknown');

          const child = {
            cells: nextCells, parent: node, index, direction, depth: node.depth + 1, paths: node.paths,
          };
          seen.set(key, child);
          nextLayer.push(child);
          if (isSolved(nextCells, targets)) solved.push(child);
        }
      }
    }

    if (solved.length > 0) {
      return result('solvable', {
        minMoves: solved[0].depth,
        solution: pathTo(solved[0], level.pieces),
        solutionCount: solved.reduce((total, node) => total + node.paths, 0),
      });
    }
    layer = nextLayer;
  }

  return result('unsolvable');
}
