import { test, before } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { rmSync } from "node:fs";

// Use a throwaway DB so the test seeds from data/seed.json deterministically.
const TMP_DB = resolve(tmpdir(), `quiniela-test-${process.pid}.db`);
process.env.DB_PATH = TMP_DB;

let standings, listPools;
before(async () => {
  rmSync(TMP_DB, { force: true });
  const db = await import("../src/db.js");
  db.loadSeedIfEmpty();
  ({ standings, listPools } = await import("../src/queries.js"));
});

test("seed loads both pools", () => {
  const names = listPools().map((p) => p.name).sort();
  assert.deepEqual(names, ["ABU", "CASA"]);
});

test("CASA standings reproduce the Excel totals", () => {
  const casa = listPools().find((p) => p.name === "CASA");
  const t = Object.fromEntries(
    standings(casa.id).map((r) => [r.name, r.points])
  );
  assert.equal(t.Sammy, 11);
  assert.equal(t.Tasha, 8);
  assert.equal(t.Tony, 3);
  assert.equal(t.Eduardo, 0);
});

test("standings are sorted by points desc", () => {
  const casa = listPools().find((p) => p.name === "CASA");
  const rows = standings(casa.id);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].points >= rows[i].points);
  }
});
