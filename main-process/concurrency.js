const os = require("os");

function getDefaultConcurrency(max = 4) {
  const cpus = typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;
  return Math.max(1, Math.min(max, Math.floor(cpus / 2) || 1));
}

/**
 * Runs `worker` over `items` with at most `limit` calls in flight. Results keep
 * input order. When `shouldStop` returns true no further items are started; the
 * results of items that never started are left as `undefined`.
 */
async function mapWithConcurrency(items, limit, worker, { shouldStop } = {}) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let started = 0;

  async function runLane() {
    while (nextIndex < items.length) {
      if (shouldStop && shouldStop()) return;
      const index = nextIndex++;
      started++;
      results[index] = await worker(items[index], index);
    }
  }

  const lanes = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    runLane
  );
  await Promise.all(lanes);
  return { results, started };
}

module.exports = {
  getDefaultConcurrency,
  mapWithConcurrency,
};
