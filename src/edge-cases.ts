import assert from "node:assert/strict";
import { build, prepare } from "../.agents/skills/company-analysis-ra/scripts/report.js";
import type { ResearchReport, Observation } from "../.agents/skills/company-analysis-ra/scripts/schema.js";
import { createFixture } from "./fixture.js";
import { inspectHtml } from "../.agents/skills/company-analysis-ra/scripts/report.js";

const fresh = (): ResearchReport => { const report = createFixture(); report.fixture = false; return report; };
const row = (report: ResearchReport, id: string): Observation => { const observation = report.observations.find((item) => item.id === id); assert.ok(observation); return observation; };

export function runEdgeCases(probe = false): number {
  let passed = 0;
  const check = (name: string, run: () => void): void => {
    try { run(); passed++; console.log(`PASS edge: ${name}`); }
    catch (error: unknown) { if (!probe) throw error; console.log(`BUG edge: ${name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`); }
  };
  const reject = (name: string, mutate: (report: ResearchReport) => void): void => check(name, () => { const report = fresh(); mutate(report); const output = build(report); assert.equal(output.gate.status, "FAIL"); assert.equal(output.html, null); });

  check("undefined input returns FAIL without exception", () => { assert.equal(build(undefined).gate.status, "FAIL"); });
  check("circular input returns FAIL without exception", () => { const circular: Record<string, unknown> = {}; circular.self = circular; assert.equal(build(circular).gate.status, "FAIL"); });
  reject("unsupported fiscal year cannot crash processing", (report) => { report.financials[0]!.fiscalYear = 100000; });
  reject("binary formula requires two inputs even when unavailable", (report) => { row(report, "upside").formula!.inputs = ["target.sk"]; });
  reject("duplicate broker names normalize case and spacing", (report) => { report.consensusId = null; report.brokers.push({ ...report.brokers[0]!, name: " K B " }); });
  reject("instant period cannot span multiple dates", (report) => { row(report, "price").period.start = "2026-10-01"; });
  reject("upside must use target price and market price", (report) => {
    const output = row(report, "upside"); output.basis = "consolidated"; output.scope = "fixture-company"; output.formula!.inputs = ["cfo.2025", "capex.2025"];
  });
  reject("stock balances cannot be summed over consecutive dates", (report) => {
    const cash = row(report, "cash.2025");
    report.observations.push({ ...cash, id: "cash.day1", period: { kind: "instant", start: "2026-10-01", end: "2026-10-01" }, observedAt: "2026-10-02T09:00:00+09:00" }, { ...cash, id: "cash.day2", period: { kind: "instant", start: "2026-10-02", end: "2026-10-02" }, observedAt: "2026-10-03T09:00:00+09:00" }, { ...cash, id: "cash.sum", value: null, sourceIds: [], period: { kind: "YTD", start: "2026-10-01", end: "2026-10-02" }, formula: { operation: "sum", inputs: ["cash.day1", "cash.day2"] } });
  });
  reject("negative interim CAPEX is not accepted", (report) => { report.observations.push({ ...row(report, "capex.2025"), id: "capex.quarter", value: -10, period: { kind: "quarter", start: "2026-01-01", end: "2026-03-31" }, observedAt: "2026-03-31T23:59:59+09:00" }); });
  reject("pie cannot count same observation twice", (report) => {
    report.observations.push({ ...row(report, "price"), id: "share", metric: "marketShare", unit: "%", value: 50 });
    report.charts = [{ id: "pie", title: "시장 구성", type: "doughnut", labels: ["기업", "중복 기업"], datasets: [{ label: "점유율", observationIds: ["share", "share"] }] }];
  });
  check("all unavailable targets make missing summary PARTIAL", () => {
    const report = fresh(); for (const broker of report.brokers) { const target = row(report, broker.targetId); target.value = null; target.status = "missing"; target.sourceIds = []; target.reason = "접근 실패"; }
    assert.equal(build(report).gate.status, "PARTIAL");
  });
  check("derived actual status follows actual inputs", () => {
    const report = fresh(); row(report, "fcf.2025").status = "estimate";
    const result = prepare(report); assert.ok(result.report); assert.equal(row(result.report, "fcf.2025").status, "actual");
  });
  reject("BigInt is rejected without serialization crash", (report) => { (row(report, "price") as unknown as { value: bigint }).value = 1n; });
  reject("unsafe numeric magnitudes require unit rescaling", (report) => { row(report, "price").value = Number.MAX_SAFE_INTEGER + 2; });
  reject("derived source IDs cannot be manually overwritten", (report) => { row(report, "target.mean").sourceIds = ["financial-source"]; });
  check("closing day is not yet a completed annual accounting period", () => { const report = fresh(); report.asOf = "2026-12-31T10:00:00+09:00"; assert.notEqual(build(report).gate.status, "FAIL"); });
  check("stale quote is explicitly PARTIAL instead of current-price PASS", () => { const report = fresh(); report.asOf = "2026-10-20T09:00:00+09:00"; const result = build(report); assert.equal(result.gate.status, "PARTIAL"); assert.ok(result.gate.warnings.some((warning) => warning.includes("시세"))); });
  check("publication date can remain unknown with explicit PARTIAL", () => { const report = fresh(); report.sources[0]!.publishedAt = null; assert.equal(build(report).gate.status, "PARTIAL"); });
  reject("undated source retrieved after historical cutoff cannot prove availability", (report) => { report.sources[0]!.publishedAt = null; report.sources[0]!.collectedAt = "2026-10-10T10:00:00+09:00"; });
  check("calculation is independent of observation order", () => {
    let seed = 7;
    for (let iteration = 0; iteration < 50; iteration++) {
      const report = fresh();
      for (let index = report.observations.length - 1; index > 0; index--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const next = seed % (index + 1);
        [report.observations[index], report.observations[next]] = [report.observations[next]!, report.observations[index]!];
      }
      const result = prepare(report); assert.ok(result.report); assert.notEqual(result.gate.status, "FAIL"); assert.equal(row(result.report, "target.mean").value, 55000); assert.equal(row(result.report, "fcf.2025").value, 25);
    }
  });
  check("long formula dependencies do not overflow call stack", () => {
    const report = fresh(); const base = row(report, "price");
    report.observations.push({ ...base, id: "offset", metric: "offset", value: 0 });
    let previous = "price";
    for (let index = 0; index < 5000; index++) { const id = `chain.${index}`; report.observations.push({ ...base, id, value: null, sourceIds: [], formula: { operation: "difference", inputs: [previous, "offset"] } }); previous = id; }
    report.observations.reverse(); const result = prepare(report); assert.ok(result.report); assert.notEqual(result.gate.status, "FAIL"); assert.equal(row(result.report, previous).value, 33700);
  });
  check("HTML inspection accepts deeply nested invalid output without stack crash", () => { const html = `<!DOCTYPE html><html><head><style></style></head><body><main>${"<div>".repeat(15000)}${"</div>".repeat(15000)}</main></body></html>`; assert.doesNotThrow(() => inspectHtml(html)); });
  check("valid complete market partition can render", () => {
    const report = fresh(); const base = row(report, "price");
    for (const [index, value] of [60, 25, 15].entries()) report.observations.push({ ...base, id: `share.${index}`, metric: "marketShare", unit: "%", value });
    report.charts = [{ id: "valid-pie", title: "시장 구성", type: "doughnut", labels: ["A", "B", "기타"], datasets: [{ label: "동일 시장", observationIds: ["share.0", "share.1", "share.2"] }] }];
    assert.notEqual(build(report).gate.status, "FAIL"); row(report, "share.1").metric = "rsi"; assert.equal(build(report).gate.status, "FAIL");
  });
  check("leap-day fiscal end uses February closing dates in non-leap years", () => {
    const report = fresh(); report.company.fiscalYearEnd = "02-29"; report.asOf = "2026-02-28T12:00:00+09:00";
    report.sources[0]!.publishedAt = "2026-02-28T09:00:00+09:00"; report.sources[0]!.collectedAt = report.asOf;
    report.sources[1]!.publishedAt = "2026-02-27T16:00:00+09:00"; report.sources[1]!.collectedAt = report.asOf;
    for (const observation of report.observations) {
      if (observation.basis === "market") { observation.period = { kind: "instant", start: "2026-02-27", end: "2026-02-27" }; observation.observedAt = "2026-02-27T15:30:00+09:00"; continue; }
      const year = Number(observation.id.split(".")[1]); const end = year === 2024 ? "2024-02-29" : `${year}-02-28`;
      observation.period.end = end; observation.period.start = observation.period.kind === "instant" ? end : `${year - 1}-03-01`; observation.observedAt = `${end}T23:59:59+09:00`;
    }
    assert.equal(build(report).gate.status, "PASS");
  });
  check("not-applicable cash flow remains distinct from missing data", () => {
    const report = fresh(); const cfo = row(report, "cfo.2025"); cfo.value = null; cfo.status = "not-applicable"; cfo.reason = "업종 분석에서 미적용"; cfo.sourceIds = [];
    const result = build(report); assert.ok(result.html); assert.match(result.html, /미적용: 업종 분석에서 미적용/);
  });
  check("small nonzero observations must not display as zero", () => {
    const report = fresh(); report.observations.push({ ...row(report, "price"), id: "tiny", metric: "ratio", unit: "%", value: 0.00003 }); report.summaryIds.push("tiny");
    const result = build(report); assert.ok(result.html); assert.match(result.html, /data-observation-id="tiny">0\.00003 %/);
  });
  check("raw decimal precision, safe integers and tiny derived values remain visible", () => {
    const report = fresh(); const base = row(report, "price");
    report.observations.push({ ...base, id: "decimal", value: 1.23456789 }, { ...base, id: "microscopic", value: 1e-25 }, { ...base, id: "safe-integer", value: Number.MAX_SAFE_INTEGER }, { ...base, id: "denominator", value: 1 }, { ...base, id: "tiny-derived", value: null, unit: "%", sourceIds: [], formula: { operation: "ratio-percent", inputs: ["microscopic", "denominator"] } });
    report.summaryIds.push("decimal", "microscopic", "safe-integer", "tiny-derived");
    const result = build(report); assert.ok(result.html);
    assert.match(result.html, /data-observation-id="decimal">1\.23456789 KRW/);
    assert.match(result.html, /data-observation-id="microscopic">1e-25 KRW/);
    assert.match(result.html, /data-observation-id="safe-integer">9,007,199,254,740,991 KRW/);
    assert.match(result.html, /data-observation-id="tiny-derived">1\.0000e-23 %/);
  });
  reject("external consensus cannot be a market price instead of a target", (report) => { report.consensusId = "price"; });
  reject("annual financials cannot declare market accounting basis", (report) => { for (const observation of report.observations) if (observation.basis === "consolidated") observation.basis = "market"; });
  reject("market price cannot be a period flow", (report) => { row(report, "price").period.kind = "quarter"; });
  reject("predicted price cannot masquerade as observed quote", (report) => { row(report, "price").status = "estimate"; });
  reject("upside period must match its market price", (report) => { row(report, "upside").period = { kind: "instant", start: "2026-10-07", end: "2026-10-07" }; });
  reject("one chart dataset cannot mix annual and cumulative periods", (report) => {
    report.observations.push({ ...row(report, "revenue.2025"), id: "interim", period: { kind: "YTD", start: "2026-01-01", end: "2026-06-30" } });
    report.charts = [{ id: "mixed-period", title: "기간 혼합", type: "line", labels: ["2025-12-31", "2026-06-30"], datasets: [{ label: "매출", observationIds: ["revenue.2025", "interim"] }] }];
  });
  check("computed overflow must also require unit rescaling", () => {
    const report = fresh(); row(report, "operatingProfit.2025").value = Number.MAX_SAFE_INTEGER; row(report, "revenue.2025").value = 1;
    report.observations.push({ ...row(report, "operatingProfit.2025"), id: "large-ratio", value: null, unit: "%", sourceIds: [], formula: { operation: "ratio-percent", inputs: ["operatingProfit.2025", "revenue.2025"] } });
    const result = build(report); assert.equal(result.gate.status, "FAIL"); assert.ok(result.gate.errors.some((error) => error.includes("Rescale computed")));
  });
  return passed;
}

if (process.argv.includes("--probe")) console.log(`${runEdgeCases(true)} edge checks currently pass.`);
