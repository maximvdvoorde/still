import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

const listed = [...read('sw.js').match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);

test('every file the service worker saves exists', () => {
  for (const file of listed) {
    assert.ok(file === './' || exists(file), `${file} does not exist`);
  }
});

test('the service worker saves everything the game loads', () => {
  const page = read('index.html');
  const fromPage = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  const fromModules = ['src/ui.js', 'src/storage.js', 'src/engine.js'].flatMap((module) => (
    [...read(module).matchAll(/from '\.\/([^']+)'/g)].map((match) => `src/${match[1]}`)
  ));

  for (const file of [...fromPage, ...fromModules, 'levels/levels.json']) {
    assert.ok(listed.includes(file), `${file} is not saved for offline use`);
  }
});

test('the manifest icons exist and it opens full-screen', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Still');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(exists(icon.src), `${icon.src} does not exist`);
});
