import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, prepare, verify } from "../docs/scripts/report.js";
import { type ResearchReport } from "../docs/scripts/schema.js";
import { createFixture } from "./fixture.js";

const root = fileURLToPath(new URL("..", import.meta.url));
if (process.argv.includes("--write-fixture")) {
  writeFileSync(resolve(root, "docs/fixtures/example.json"), `${JSON.stringify(createFixture(), null, 2)}\n`, "utf8");
}
const input: ResearchReport = JSON.parse(readFileSync(resolve(root, "docs/fixtures/example.json"), "utf8")) as ResearchReport;
let cases = 0;
function test(name: string, run: () => void): void { run(); cases++; console.log(`PASS ${name}`); }
function fail(name: string, mutate: (report: ResearchReport) => void, expected: RegExp): void {
  test(name, () => { const report = structuredClone(input); mutate(report); const result = build(report); assert.equal(result.gate.status, "FAIL"); assert.equal(result.html, null); assert.match(result.gate.errors.join("\n"), expected); });
}
const observation = (report: ResearchReport, id: string): ResearchReport["observations"][number] => {
  const row = report.observations.find((item) => item.id === id); assert.ok(row); return row;
};

test("complete fixture builds with explicit synthetic warning", () => { const result = build(input); assert.equal(result.gate.status, "PARTIAL"); assert.ok(result.html); assert.match(result.html, /가상 fixture/); assert.deepEqual(verify(input, result.html).errors, []); });
test("complete non-fixture contract can pass automatic checks", () => { const report = structuredClone(input); report.fixture = false; assert.equal(build(report).gate.status, "PASS"); });
test("mean excludes unavailable target and preserves chart null", () => {
  const result = prepare(input); assert.ok(result.report); assert.equal(observation(result.report, "target.mean").value, 55000); assert.equal(observation(result.report, "fcf.2025").value, 25);
  const output = build(input); assert.ok(output.html); const payload = /<script id="chart-data" type="application\/json">([\s\S]*?)<\/script>/.exec(output.html)?.[1]; assert.ok(payload);
  const parsed = JSON.parse(payload) as Array<{ data: { datasets: Array<{ data: Array<number | null> }> } }>;
  assert.deepEqual(parsed[0]?.data.datasets[0]?.data, [44000, 61000, 60000, null]);
  assert.match(output.html, /55,000 KRW/);
});
test("incomplete required finance is PARTIAL with reasons", () => { const report = structuredClone(input); const row = observation(report, "cfo.2025"); row.value = null; row.status = "missing"; row.reason = "원문 접근 실패"; row.sourceIds = []; const result = build(report); assert.equal(result.gate.status, "PARTIAL"); assert.ok(result.gate.missingRequiredIds.includes("cfo.2025")); });
fail("numeric strings are rejected instead of comma rewriting", (report) => { (observation(report, "price") as unknown as { value: string }).value = "33,700"; }, /SCHEMA/);
fail("hand-entered derived mean cannot be supplied", (report) => { observation(report, "target.mean").value = 53667; }, /Derived value/);
fail("mismatched currency cannot enter mean", (report) => { observation(report, "target.nh").unit = "USD"; }, /unit mismatch/);
fail("quarter cannot replace an annual financial year", (report) => { observation(report, "revenue.2025").period.kind = "YTD"; }, /Annual financial/);
fail("balance sheet stock cannot be a year-long flow", (report) => { observation(report, "assets.2025").period.kind = "FY"; observation(report, "assets.2025").period.start = "2025-01-01"; }, /Annual financial|Incomplete annual/);
fail("partial year cannot masquerade as FY", (report) => { observation(report, "revenue.2025").period.start = "2025-07-01"; }, /Incomplete annual/);
fail("invalid fiscal year end fails schema without crashing", (report) => { report.company.fiscalYearEnd = "13-31"; }, /Invalid fiscal year/);
fail("core missing revenue cannot bypass coverage as not-applicable", (report) => { const row = observation(report, "revenue.2025"); row.status = "not-applicable"; row.value = null; row.sourceIds = []; row.reason = "미확보를 미적용으로 바꾸는 잘못된 입력"; }, /cannot be marked/);
fail("financial comparison cannot mix consolidated and separate", (report) => { observation(report, "operatingProfit.2025").basis = "separate"; }, /financial.*mismatch|comparison definitions/);
fail("future publication is excluded", (report) => { report.sources[0]!.publishedAt = "2026-10-10T09:00:00+09:00"; report.sources[0]!.collectedAt = "2026-10-10T10:00:00+09:00"; }, /Future publication/);
fail("future observation is excluded", (report) => { observation(report, "price").observedAt = "2026-10-10T09:00:00+09:00"; }, /Future observation/);
fail("evidence reference must exist", (report) => { observation(report, "price").sourceIds = ["unknown-source"]; }, /unknown source/);
fail("analysis cannot hardcode a stale RSI", (report) => { report.conclusion[0]!.text = "RSI는 32.4입니다."; }, /Narrative number/);
fail("agent trading recommendation is rejected", (report) => { report.conclusion[0]!.text = "{{obs:price}}에서 분할 매수 추천합니다."; }, /Agent trading/);
test("sourced external opinion is retained as attributed view", () => { const report = structuredClone(input); report.conclusion.push({ kind: "external-view", text: "매수 의견을 유지했다는 외부 하우스 견해입니다.", sourceIds: ["market-source"], attribution: "가상 하우스", literalTerms: [] }); assert.notEqual(build(report).gate.status, "FAIL"); });
test("product identifiers do not become false numeric findings", () => { const report = structuredClone(input); report.narrative[0]!.text = "HBM4 제품을 취급하는 가상 사례입니다."; report.narrative[0]!.sourceIds = ["financial-source"]; report.narrative[0]!.literalTerms = ["HBM4"]; assert.notEqual(build(report).gate.status, "FAIL"); });
fail("missing opposing-house attribution is rejected", (report) => { report.conclusion[0]!.kind = "external-view"; report.conclusion[0]!.sourceIds = ["market-source"]; }, /attribution/);
fail("balance sheet identity is checked", (report) => { observation(report, "assets.2025").value = 250; }, /Assets !=/);
fail("formula cycle fails without recursion overflow", (report) => { observation(report, "target.mean").formula!.inputs = ["target.mean"]; }, /Formula cycle/);
fail("division by zero is rejected", (report) => { observation(report, "price").value = 0; }, /Zero denominator/);
fail("doughnut cannot combine incomplete market shares", (report) => { report.charts[0]!.type = "doughnut"; }, /Doughnut/);
fail("mean must match displayed broker population", (report) => { observation(report, "target.mean").formula!.inputs = ["target.kb", "target.nh"]; }, /exactly the displayed/);
fail("broker target must reference a target-price observation", (report) => { report.brokers[0]!.targetId = "price"; }, /Broker target definition/);
fail("financial ratio cannot mix fiscal years", (report) => { report.observations.push({ ...observation(report, "operatingProfit.2025"), id: "invalid-margin", value: null, unit: "%", sourceIds: [], formula: { operation: "ratio-percent", inputs: ["operatingProfit.2025", "revenue.2024"] } }); }, /Ratio period/);
fail("same broker cannot appear twice in latest snapshot", (report) => { report.brokers.push(structuredClone(report.brokers[0]!)); }, /latest target/);
fail("line dates cannot relabel stale observations", (report) => { report.charts[0]!.type = "line"; }, /Line labels/);
test("HTML and chart changes invalidate canonical verification", () => {
  const result = build(input); assert.ok(result.html);
  assert.equal(verify(input, result.html.replace("[44000,61000,60000,null]", "[44000,61000,60000,50000]")).status, "FAIL");
  assert.equal(verify(input, `${result.html}\n</body></html>`).status, "FAIL");
});
test("escaping preserves text and script boundaries", () => {
  const report = structuredClone(input); report.company.name = "O'Reilly <demo>"; report.profile[0]!.text = "</script><script>alert('demo')</script>";
  const result = build(report); assert.ok(result.html); assert.match(result.html, /O&#39;Reilly &lt;demo&gt;/); assert.match(result.html, /&lt;\/script&gt;/);
});
test("valid distinct observations 1 and 234 remain distinct", () => { const report = structuredClone(input); observation(report, "target.kb").value = 1; observation(report, "target.nh").value = 234; const output = build(report); assert.ok(output.html); assert.match(output.html, /"data":\[1,234,60000,null\]/); });
test("date-only publication on intraday cutoff requires review without false future error", () => { const report = structuredClone(input); report.asOf = "2026-10-09T00:30:00+09:00"; report.sources[0]!.publishedAt = "2026-10-09"; report.sources[0]!.collectedAt = report.asOf; const result = build(report); assert.equal(result.gate.status, "PARTIAL"); assert.deepEqual(result.gate.errors, []); assert.ok(result.gate.warnings.some((warning) => warning.includes("당일"))); });
test("sum checks contiguous quarter periods", () => {
  const report = structuredClone(input); const base = observation(report, "revenue.2025");
  report.observations.push({ ...base, id: "q1", value: 100, period: { kind: "quarter", start: "2025-01-01", end: "2025-03-31" } }, { ...base, id: "q2", value: 110, period: { kind: "quarter", start: "2025-04-01", end: "2025-06-30" } }, { ...base, id: "h1", value: null, sourceIds: [], period: { kind: "YTD", start: "2025-01-01", end: "2025-06-30" }, formula: { operation: "sum", inputs: ["q1", "q2"] } });
  const valid = prepare(report); assert.ok(valid.report); assert.equal(observation(valid.report, "h1").value, 210); assert.notEqual(valid.gate.status, "FAIL");
  observation(report, "q2").period.start = "2025-03-01"; assert.equal(build(report).gate.status, "FAIL");
});
test("template CSS is retained from reviewed design", () => {
  const current = readFileSync(resolve(root, "docs/template.html"), "utf8");
  const css = /<style>([\s\S]*?)<\/style>/.exec(current)?.[1]?.replace(/\r/g, ""); assert.ok(css);
  assert.equal(createHash("sha256").update(css).digest("hex"), "613db431476b4a84a31b3f1acfde13229561c69635496839fa69cc5e741b8fd6");
});
test("skill references resolve within the shipped package", () => {
  for (const path of ["docs/SKILL.md", "docs/references/data-contract.md", "docs/references/research.md"]) {
    for (const match of readFileSync(resolve(root, path), "utf8").matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1]; assert.ok(target); if (/^https?:/.test(target)) continue;
      assert.ok(existsSync(fileURLToPath(new URL(target, pathToFileURL(resolve(root, path))))), `${path}: missing ${target}`);
    }
  }
});
test("CLI writes gate and rejects modified output with nonzero exit", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "company-ra-test-")); const inputPath = resolve(directory, "input.json"); const outputPath = resolve(directory, "output.html");
  writeFileSync(inputPath, JSON.stringify(input), "utf8");
  const args = ["--import", "tsx", resolve(root, "docs/scripts/report.ts")];
  const generated = spawnSync(process.execPath, [...args, "build", inputPath, outputPath], { encoding: "utf8", cwd: root }); assert.equal(generated.status, 0, generated.stderr + generated.stdout);
  const gate = JSON.parse(readFileSync(`${outputPath}.gate.json`, "utf8")) as { status: string }; assert.equal(gate.status, "PARTIAL");
  writeFileSync(outputPath, `${readFileSync(outputPath, "utf8")}\n</body>`, "utf8");
  const checked = spawnSync(process.execPath, [...args, "verify", inputPath, outputPath], { encoding: "utf8", cwd: root }); assert.equal(checked.status, 1); assert.match(checked.stdout, /FAIL/);
});
console.log(`${cases} behavioral checks passed.`);
