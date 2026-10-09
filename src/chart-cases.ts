import assert from "node:assert/strict";
import { Script } from "node:vm";
import { build } from "../docs/scripts/report.js";
import { createFixture } from "./fixture.js";

interface Config { type: string; data: { datasets: Array<{ data: Array<number | null>; spanGaps: boolean }> } }
export function runChartCases(): number {
  const input = createFixture(); input.charts.push({ ...input.charts[0]!, id: "second-chart" });
  const result = build(input); assert.ok(result.html);
  const scripts = [...result.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const json = scripts.find((match) => (match[1] ?? "").includes('type="application/json"'))?.[2]; assert.ok(json);
  const runtime = scripts.find((match) => !(match[1] ?? "").includes("src=") && !(match[1] ?? "").includes("application/json"))?.[2]; assert.ok(runtime);
  function execute(options: { noLibrary?: boolean; missingCanvas?: boolean; missingPayload?: boolean; throwFirst?: boolean }) {
    const calls: Config[] = []; const fallbacks: string[] = [];
    const document = {
      getElementById(id: string) {
        if (id === "chart-data") return options.missingPayload ? null : { textContent: json };
        return options.missingCanvas ? null : { id, replaceWith(element: { textContent: string }) { fallbacks.push(element.textContent); } };
      },
      createElement() { return { textContent: "" }; },
    };
    class MockChart { constructor(canvas: { id: string }, config: Config) { if (options.throwFirst && canvas.id === "target-chart") throw new Error("Simulated chart initialization failure"); calls.push(config); } }
    new Script(runtime!).runInNewContext({ document, ...(options.noLibrary ? {} : { Chart: MockChart }) }, { timeout: 1000 });
    return { calls, fallbacks };
  }
  let cases = 0;
  const check = (name: string, run: () => void): void => { run(); cases++; console.log(`PASS chart runtime: ${name}`); };
  check("chart receives canonical values including missing null", () => { const result = execute({}); assert.equal(result.calls.length, 2); assert.deepEqual(Array.from(result.calls[0]!.data.datasets[0]!.data), [44000, 61000, 60000, null]); assert.equal(result.calls[0]!.data.datasets[0]!.spanGaps, false); });
  check("unavailable library shows data-table fallback", () => { const result = execute({ noLibrary: true }); assert.equal(result.calls.length, 0); assert.equal(result.fallbacks.length, 2); assert.ok(result.fallbacks.every((text) => text.includes("라이브러리 미로드"))); });
  check("one failed chart does not prevent remaining charts", () => { const result = execute({ throwFirst: true }); assert.equal(result.calls.length, 1); assert.equal(result.fallbacks.length, 1); assert.match(result.fallbacks[0]!, /표시하지 못했습니다/); });
  check("missing canvas is guarded", () => { assert.equal(execute({ missingCanvas: true }).calls.length, 0); });
  check("missing payload exits without exception", () => { assert.equal(execute({ missingPayload: true }).calls.length, 0); });
  return cases;
}
