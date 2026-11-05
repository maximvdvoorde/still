// Checks every level in a levels file and fills in minMoves.
// Usage: node tools/solve.js levels/levels.json

import { readFileSync, writeFileSync } from 'node:fs';
import { validateLevel } from '../src/engine.js';
import { solve } from '../src/solver.js';

// Keeps the file readable by hand: one line per piece, as in the spec.
function formatPiece(piece) {
  const fields = Object.entries(piece).map(([name, value]) => `"${name}": ${JSON.stringify(value)}`);
  return `        { ${fields.join(', ')} }`;
}

function formatLevel(level) {
  const fields = Object.entries(level).map(([name, value]) => {
    if (name !== 'pieces') return `      "${name}": ${JSON.stringify(value)}`;
    return `      "pieces": [\n${value.map(formatPiece).join(',\n')}\n      ]`;
  });
  return `    {\n${fields.join(',\n')}\n    }`;
}

function formatFile(file) {
  return `{\n  "version": ${file.version},\n  "levels": [\n${file.levels.map(formatLevel).join(',\n')}\n  ]\n}\n`;
}

function sameColourNeighbours(level) {
  const helpers = level.pieces.filter((piece) => piece.kind === 'helper');
  return helpers.flatMap((a, index) => helpers.slice(index + 1)
    .filter((b) => a.color === b.color
      && Math.abs(a.pos[0] - b.pos[0]) + Math.abs(a.pos[1] - b.pos[1]) === 1)
    .map((b) => `${a.id}/${b.id}`));
}

const path = process.argv[2];
if (path === undefined) {
  console.error('Usage: node tools/solve.js levels/levels.json');
  process.exit(2);
}

const file = JSON.parse(readFileSync(path, 'utf8'));
const ids = file.levels.map((level) => level.id);
let failed = false;

for (const level of file.levels) {
  const problems = validateLevel(level);
  if (ids.indexOf(level.id) !== ids.lastIndexOf(level.id)) problems.push('level id is not unique');

  if (problems.length > 0) {
    console.log(`${level.id}  INVALID: ${problems.join('; ')}`);
    level.minMoves = null;
    failed = true;
    continue;
  }

  const result = solve(level);
  level.minMoves = result.minMoves;

  if (result.status !== 'solvable') {
    console.log(`${level.id}  ${result.status.toUpperCase()} after ${result.states} states`);
    failed = true;
    continue;
  }

  const moves = result.solution.map((move) => `${move.piece} ${move.direction}`).join(', ');
  console.log(`${level.id}  ${result.minMoves} moves, ${result.solutionCount} shortest, ${result.states} states`);
  console.log(`  ${moves}`);

  const neighbours = sameColourNeighbours(level);
  if (neighbours.length > 0) console.log(`  warning: neighbouring helpers share a colour: ${neighbours.join(', ')}`);
}

writeFileSync(path, formatFile(file));
if (failed) process.exitCode = 1;
