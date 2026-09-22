import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../js/cloud-storage.js", import.meta.url), "utf8");
const { collectCloudFiles } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function run(projectFiles) {
  const pageSize = projectFiles;
  let calls = 0;
  const startedHeap = process.memoryUsage().heapUsed;
  const started = performance.now();
  let failure;
  try {
    await collectCloudFiles({
      async list() { return nextPage(); },
      async continue() { return nextPage(); },
    }, {
      scopes: [{ path: "/safe-synthetic" }],
      provider: "mock",
      maxResults: projectFiles * 3,
      maxExamined: projectFiles * 3,
    });
  } catch (error) {
    failure = error;
  }

  function nextPage() {
    calls += 1;
    const entries = Array.from({ length: pageSize }, (_, index) => ({
      id: `project-${calls}-${index}`,
      name: `synthetic-${calls}-${index}.lal`,
    }));
    // Model a buggy provider that never advances after the first page.
    return { entries, hasMore: true, cursor: "repeated-safe-cursor" };
  }

  assert.equal(failure?.code, "catalog_integrity");
  assert.equal(calls, 2, "cursor cycles must have a constant provider-call bound");
  return {
    projectFiles,
    calls,
    ms: performance.now() - started,
    heapMb: (process.memoryUsage().heapUsed - startedHeap) / 1024 / 1024,
    baselineCalls: "unbounded",
  };
}

console.log("project_files,baseline_calls,bounded_calls,bounded_ms,bounded_heap_mb");
for (const count of [1_000, 10_000, 50_000]) {
  const result = await run(count);
  console.log([
    count,
    result.baselineCalls,
    result.calls,
    result.ms.toFixed(2),
    result.heapMb.toFixed(2),
  ].join(","));
}
