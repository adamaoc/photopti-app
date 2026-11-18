const assert = require("assert");
const test = require("node:test");
const { getDefaultConcurrency, mapWithConcurrency } = require("../main-process/concurrency");

test("runs work with bounded concurrency and keeps result order", async () => {
  let inFlight = 0;
  let peak = 0;
  const { results, started } = await mapWithConcurrency([30, 5, 20, 1, 10], 2, async (delay, index) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delay));
    inFlight--;
    return index * 10;
  });

  assert.equal(peak, 2);
  assert.equal(started, 5);
  assert.deepEqual(results, [0, 10, 20, 30, 40]);
});

test("stops scheduling new work when asked", async () => {
  let calls = 0;
  const { started } = await mapWithConcurrency([1, 2, 3, 4], 1, async () => {
    calls++;
  }, { shouldStop: () => calls >= 2 });

  assert.equal(started, 2);
});

test("default concurrency is between 1 and 4", () => {
  const value = getDefaultConcurrency();
  assert.ok(value >= 1 && value <= 4);
});
