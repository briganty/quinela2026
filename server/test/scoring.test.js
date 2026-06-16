import { test } from "node:test";
import assert from "node:assert/strict";
import { points, OUTCOME, officialFor } from "../src/scoring.js";

test("exact score = 3", () => {
  assert.equal(points(2, 0, 2, 0), 3);
  assert.equal(points(1, 1, 1, 1), 3);
});

test("correct outcome only = 1", () => {
  assert.equal(points(2, 0, 3, 1), 1); // home win
  assert.equal(points(0, 2, 1, 3), 1); // away win
  assert.equal(points(1, 1, 2, 2), 1); // draw
});

test("wrong = 0", () => {
  assert.equal(points(2, 0, 0, 1), 0);
  assert.equal(points(1, 1, 2, 0), 0);
});

test("missing values = 0", () => {
  assert.equal(points(null, null, 1, 0), 0);
  assert.equal(points(1, 0, null, null), 0);
});

test("OUTCOME helper", () => {
  assert.equal(OUTCOME(2, 1), "H");
  assert.equal(OUTCOME(0, 3), "A");
  assert.equal(OUTCOME(1, 1), "D");
});

test("officialFor honors reversed orientation", () => {
  const m = { official_home: 2, official_away: 0 };
  assert.deepEqual(officialFor(m, 0), { home: 2, away: 0 });
  assert.deepEqual(officialFor(m, 1), { home: 0, away: 2 });
  assert.deepEqual(officialFor({ official_home: null, official_away: null }, 0), {
    home: null,
    away: null,
  });
});
