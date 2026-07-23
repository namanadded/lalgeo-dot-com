import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

async function importCloudModule() {
  const source = await readFile(new URL("../../js/cloud-storage.js", import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { collectCloudFiles } = await importCloudModule();
const PAGE_SIZE = 2_000;
const PROJECT_FILES = 120;

function entry(index, project = false) {
  const name = project ? `project-${index}.lal` : `unrelated-${index}.bin`;
  const path = project ? `/LalGeoDB/${name}` : `/Archive/${name}`;
  return { id: `${project ? "project" : "other"}-${index}`, name, path_lower: path.toLowerCase() };
}

function page(start, count, project = false) {
  const length = Math.min(PAGE_SIZE, count - start);
  return Array.from({ length }, (_, offset) => entry(start + offset, project));
}

async function run(unrelatedFiles, legacyWholeAccountScan) {
  let examined = 0;
  const startedHeap = process.memoryUsage().heapUsed;
  const started = performance.now();
  const scopes = legacyWholeAccountScan
    ? [{ path: "/LalGeoDB", recursive: true }, { path: "", recursive: true }]
    : [{ path: "/LalGeoDB", recursive: true }, { path: "", recursive: false }];
  const adapter = {
    async list(scope) {
      return makePage(scope, 0);
    },
    async continue(cursor) {
      return makePage(cursor.scope, cursor.offset);
    },
  };
  function makePage(scope, offset) {
    const wholeAccount = scope.path === "" && scope.recursive;
    const count = wholeAccount ? unrelatedFiles + PROJECT_FILES : scope.path === "/LalGeoDB" ? PROJECT_FILES : 0;
    const project = !wholeAccount;
    const entries = page(offset, count, project);
    examined += entries.length;
    const nextOffset = offset + entries.length;
    return { entries, hasMore: nextOffset < count, cursor: { scope, offset: nextOffset } };
  }
  const result = await collectCloudFiles(adapter, {
    scopes,
    accept: (item) => item.name.endsWith(".lal"),
    mapEntry: (item) => ({ ...item, pathLower: item.path_lower }),
    keyOf: (item) => item.pathLower,
  });
  return {
    ms: performance.now() - started,
    heapMb: (process.memoryUsage().heapUsed - startedHeap) / 1024 / 1024,
    pages: result.stats.pages,
    examined,
    matched: result.rows.length,
  };
}

console.log("unrelated_files,baseline_pages,scoped_pages,baseline_examined,scoped_examined,baseline_ms,scoped_ms,baseline_heap_mb,scoped_heap_mb");
for (const count of [10_000, 100_000, 1_000_000]) {
  const baseline = await run(count, true);
  const scoped = await run(count, false);
  console.log([
    count, baseline.pages, scoped.pages, baseline.examined, scoped.examined,
    baseline.ms.toFixed(2), scoped.ms.toFixed(2), baseline.heapMb.toFixed(2), scoped.heapMb.toFixed(2),
  ].join(","));
}
