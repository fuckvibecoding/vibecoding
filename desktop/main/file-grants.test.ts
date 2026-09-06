import assert from 'node:assert/strict';
import test from 'node:test';

import { SelectedFileGrants } from './file-grants.ts';

test('selected-file grant is single-use and does not authorize arbitrary paths', () => {
  const grants = new SelectedFileGrants(1_000);
  const token = grants.issue('/tmp/selected.txt', 100);
  assert.equal(grants.consume('/tmp/selected.txt', 101), null, 'a path is not a file-read capability');
  assert.equal(grants.consume(token, 101), '/tmp/selected.txt');
  assert.equal(grants.consume(token, 101), null, 'the selected-file authority is consumed once');
});

test('selected-file grants expire before they can read a file', () => {
  const grants = new SelectedFileGrants(10);
  const token = grants.issue('/tmp/selected.txt', 100);
  assert.equal(grants.consume(token, 110), null);
});
