// Tests for the dataset and Monte Carlo exports. Run: node --test tools/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./colonization-sim.js");

const RUNS = 6;
const mc = Sim.exportMonteCarlo(RUNS, { firstSeed: 1000, scriptCommit: "abc123" });

test("quantile uses the nearest rank and handles the ends", () => {
  const sorted = [10, 20, 30, 40, 50];
  assert.equal(Sim.quantile(sorted, 0), 10);
  assert.equal(Sim.quantile(sorted, 0.5), 30);
  assert.equal(Sim.quantile(sorted, 0.9), 50);
  assert.equal(Sim.quantile([], 0.5), null);
});

test("run metadata names the seeds, years and script commit", () => {
  assert.equal(mc.schemaVersion, "1.0.0");
  assert.deepEqual(
    { firstSeed: mc.run.firstSeed, runCount: mc.run.runCount, canonicalSeed: mc.run.canonicalSeed, scriptCommit: mc.run.scriptCommit },
    { firstSeed: 1000, runCount: RUNS, canonicalSeed: 1701, scriptCommit: "abc123" },
  );
  assert.equal(mc.run.startYear, 2151);
  assert.equal(mc.run.endYear, 2380);
});

test("every world has a median between its 10th and 90th percentile, and one sample per run that reached it", () => {
  assert.equal(mc.worlds.length, 33);
  for (const w of mc.worlds) {
    for (const [metric, m] of Object.entries(w.metrics)) {
      assert.ok(m.samples.length <= RUNS, `${w.id} ${metric}`);
      assert.equal(m.shareOfRuns, m.samples.length / RUNS);
      if (m.samples.length) {
        assert.ok(m.p10 <= m.median && m.median <= m.p90, `${w.id} ${metric}: ${m.p10} ${m.median} ${m.p90}`);
        assert.deepEqual(m.samples, [...m.samples]);
      } else {
        assert.equal(m.median, null);
      }
    }
  }
});

test("world ids match the dataset's ids", () => {
  const ids = mc.worlds.map((w) => w.id);
  assert.ok(ids.includes("mars") && ids.includes("titan") && ids.includes("dysnomia"));
  assert.equal(new Set(ids).size, ids.length);
});

test("each canon deadline has a share between 0 and 1, a source and a median result", () => {
  assert.equal(mc.deadlines.length, 6);
  for (const d of mc.deadlines) {
    assert.ok(d.shareMet >= 0 && d.shareMet <= 1);
    assert.ok(d.source && d.by);
    assert.ok(d.medianResult !== undefined);
  }
  assert.ok(mc.deadlines.some((d) => d.world === "moon" && d.event === "population" && d.atLeast === 50e6));
});

test("market statistics cover founded, trading, bought and trading brands by kind", () => {
  for (const key of ["companiesFounded", "brandsTrading", "companiesBought"]) {
    const m = mc.market[key];
    assert.ok(m.p10 <= m.median && m.median <= m.p90, key);
  }
  assert.ok(Object.keys(mc.market.brandsByKind).length >= 4);
});

test("the export is repeatable: the same seeds give the same file", () => {
  const again = Sim.exportMonteCarlo(RUNS, { firstSeed: 1000, scriptCommit: "abc123", generatedAt: mc.run.generatedAt });
  assert.deepEqual(again, mc);
});

test("the canonical dataset carries the script commit", () => {
  const data = Sim.exportDataset(Sim.simulate({ seed: 1701 }), { scriptCommit: "abc123" });
  assert.equal(data.meta.scriptCommit, "abc123");
  assert.equal(data.meta.seed, 1701);
  assert.equal(data.worlds.length, 33);
});
