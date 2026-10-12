import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, prepare, verify } from "../.agents/skills/company-analysis-ra/scripts/report.js";
import { evidenceFingerprint } from "../.agents/skills/company-analysis-ra/scripts/quality.js";
import type { Observation, ResearchReport } from "../.agents/skills/company-analysis-ra/scripts/schema.js";
import { createResearchFixture, stampFixtureReviews } from "./research-fixture.js";

function fixture(): ResearchReport { const report = createResearchFixture(); report.fixture = false; stampFixtureReviews(report); return report; }
function observation(report: ResearchReport, id: string): Observation { const row = report.observations.find((item) => item.id === id); assert.ok(row); return row; }
export function runResearchCases(): number {
  let cases = 0;
  const check = (name: string, run: () => void): void => { run(); cases++; console.log(`PASS research completion: ${name}`); };
  check("fully covered and reviewed hypothetical contract reaches FINAL", () => {
    const result = build(fixture()); assert.equal(result.gate.status, "PASS", result.gate.warnings.join("\n")); assert.equal(result.gate.research?.state, "FINAL"); assert.ok(result.html); assert.match(result.html, /최종 보고서/);
  });
  check("synthetic data stays DRAFT even with complete records", () => { const result = build(createResearchFixture()); assert.equal(result.gate.status, "PARTIAL"); assert.equal(result.gate.research?.state, "DRAFT"); assert.match(result.html!, /가상 실행 예시/); });
  check("required missing consensus blocks FINAL", () => {
    const report = fixture(); report.consensusId = null; report.brokers = []; stampFixtureReviews(report); const result = build(report); assert.equal(result.gate.research?.state, "DRAFT"); assert.ok(result.gate.warnings.some((item) => item.includes("컨센서스")));
  });
  check("required detailed accounts cannot be silently omitted", () => {
    const report = fixture(); report.observations = report.observations.filter((row) => row.id !== "sga.2024"); stampFixtureReviews(report); const result = build(report); assert.equal(result.gate.status, "PARTIAL"); assert.ok(result.gate.warnings.some((item) => item.includes("FY2024") && item.includes("sga")));
  });
  check("coverage records cannot claim completion without evidence", () => { const report = fixture(); const coverage = report.research!.coverage[0]!; coverage.sourceIds = []; coverage.observationIds = []; stampFixtureReviews(report); assert.equal(build(report).gate.status, "FAIL"); });
  check("unavailable topic requires concrete retrieval attempts", () => { const report = fixture(); report.research!.coverage[0]!.status = "unavailable"; stampFixtureReviews(report); assert.equal(build(report).gate.status, "FAIL"); });
  check("changing an input invalidates previously stamped review", () => { const report = fixture(); observation(report, "price").value = 33800; const result = build(report); assert.equal(result.gate.research?.state, "DRAFT"); assert.ok(result.gate.warnings.some((item) => item.includes("입력 변경"))); });
  check("reviewing sources without all raw numbers is incomplete", () => {
    const report = fixture(); report.research!.checks.find((row) => row.kind === "sources")!.observationIds.pop(); const result = build(report); assert.equal(result.gate.research?.state, "DRAFT"); assert.equal(result.gate.research?.missingReviewIds.length, 1);
  });
  check("unperformed source review lists the raw numbers still needing comparison", () => { const report = fixture(); const check = report.research!.checks.find((row) => row.kind === "sources")!; check.status = "not-run"; check.evidenceSha256 = null; const result = build(report); assert.equal(result.gate.research?.missingReviewIds.length, report.observations.filter((row) => row.value !== null && !row.formula).length); });
  check("a changed renderer requires screen review again", () => { const report = fixture(); report.research!.checks.find((row) => row.kind === "desktop")!.rendererSha256 = "0".repeat(64); const result = build(report); assert.equal(result.gate.research?.state, "DRAFT"); assert.ok(result.gate.warnings.some((item) => item.includes("생성기 변경"))); });
  check("rendering failure and modified HTML cannot retain FINAL status", () => {
    const report = fixture(); const result = build(report); assert.ok(result.html); assert.equal(verify(report, result.html + " ").research?.state, "DRAFT");
    report.financialRows = [{ statement: "income", metric: "extra-row", label: "가상 계정", afterMetric: "unknown-anchor" }]; stampFixtureReviews(report); const broken = build(report); assert.equal(broken.gate.status, "FAIL"); assert.equal(broken.gate.research?.state, "DRAFT");
  });
  check("HTML scope can finish while requested print scope requires print review", () => { const report = fixture(); assert.equal(build(report).gate.research?.state, "FINAL"); report.research!.output = "print-ready"; stampFixtureReviews(report); const result = build(report); assert.equal(result.gate.research?.state, "DRAFT"); assert.ok(result.gate.warnings.some((item) => item.includes("print 검수"))); });
  check("executive numeric claims use the same evidence rules", () => { const report = fixture(); report.executive![0]!.text = "매출은 999입니다."; stampFixtureReviews(report); assert.equal(build(report).gate.status, "FAIL"); });
  check("optional empty sections and their navigation are omitted together", () => { const result = build(fixture()); assert.ok(result.html); assert.doesNotMatch(result.html, /id="s1d"|href="#s1d"/); assert.match(result.html, /id="sv"/); });
  check("generated report includes licensed chart runtime without external script", () => { const result = build(fixture()); assert.ok(result.html); assert.match(result.html, /id="chart-library"/); assert.match(result.html, /Chart\.js v4\.5\.1/); assert.doesNotMatch(result.html, /<script\b[^>]*\bsrc=/i); });
  check("evidence hash survives schema parsing and calculation", () => { const report = fixture(); const prepared = prepare(report); assert.ok(prepared.report); assert.equal(evidenceFingerprint(report), evidenceFingerprint(prepared.report)); });
  check("growth compares current to prior flow, zero or negative bases stay N/A", () => {
    const report = fixture(); const row = observation(report, "revenue.2025"); report.observations.push({ ...row, id: "growth", metric: "revenueGrowth", value: null, unit: "%", sourceIds: [], formula: { operation: "growth-percent", inputs: ["revenue.2025", "revenue.2024"] } }); stampFixtureReviews(report);
    const prepared = prepare(report); assert.ok(prepared.report); assert.ok(Math.abs(observation(prepared.report, "growth").value! - 100 / 11) < 1e-10);
    observation(report, "revenue.2024").value = 0; const zero = prepare(report); assert.ok(zero.report); assert.equal(observation(zero.report, "growth").status, "not-applicable"); assert.equal(observation(zero.report, "growth").value, null);
    observation(report, "revenue.2024").value = -1; const negative = prepare(report); assert.ok(negative.report); assert.equal(observation(negative.report, "growth").status, "not-applicable");
  });
  check("financial industry labels and extra rows do not alter global defaults", () => {
    const report = fixture(); const base = observation(report, "assets.2025"); report.observations.push({ ...base, id: "loans.2025", metric: "loans", label: "가상 대출금", value: 100 });
    report.financialRows = [{ statement: "income", metric: "revenue", label: "영업수익", style: "total" }, { statement: "balance", metric: "loans", label: "대출채권", style: "detail", afterMetric: "currentAssets" }]; report.research!.financialModel = "financial"; stampFixtureReviews(report);
    const result = build(report); assert.ok(result.html); assert.match(result.html, /대출채권/); assert.match(result.html, /영업수익/); assert.doesNotMatch(build(fixture()).html!, /대출채권/);
  });
  check("custom financial percentages retain their unit even without ratio styling", () => {
    const report = fixture(); const base = observation(report, "assets.2025"); report.financialRows = [{ statement: "balance", metric: "capitalRatio", label: "자본비율" }];
    report.observations.push({ ...base, id: "capital.2025", metric: "capitalRatio", value: 15.2, unit: "%" }, { ...base, id: "capital.latest", metric: "capitalRatio", value: 16.3, unit: "%", period: { kind: "instant", start: "2026-06-30", end: "2026-06-30" }, observedAt: "2026-06-30T23:59:59+09:00" }); stampFixtureReviews(report);
    const result = build(report); assert.ok(result.html); assert.match(result.html, /단위: 억원, %/); assert.match(result.html, /단위: %<\/span>/); assert.match(result.html, /data-observation-id="capital.latest"/);
  });
  check("audit CLI enforces final status and leaves input unchanged", () => {
    const folder = mkdtempSync(resolve(tmpdir(), "research-final-")); const path = resolve(folder, "한글 입력.json"); const report = fixture(); const before = JSON.stringify(report); writeFileSync(path, `\uFEFF${before}`);
    const root = fileURLToPath(new URL("..", import.meta.url)); const script = resolve(root, ".agents/skills/company-analysis-ra/scripts/audit.ts");
    const run = (): number | null => spawnSync(process.execPath, ["--import", "tsx", script, path, "--final"], { encoding: "utf8", cwd: root }).status;
    assert.equal(run(), 0); assert.equal(readFileSync(path, "utf8"), `\uFEFF${before}`); report.research!.intent = "draft"; writeFileSync(path, JSON.stringify(report)); assert.equal(run(), 2); writeFileSync(path, "{"); assert.equal(run(), 1);
  });
  return cases;
}
