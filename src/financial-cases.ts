import assert from "node:assert/strict";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { build } from "../.agents/skills/company-analysis-ra/scripts/report.js";
import type { Observation, ResearchReport } from "../.agents/skills/company-analysis-ra/scripts/schema.js";
import { createFixture } from "./fixture.js";

type Node = DefaultTreeAdapterMap["node"];
function all(node: Node): Node[] { return [node, ...("childNodes" in node ? node.childNodes.flatMap(all) : [])]; }
function attr(node: Node, name: string): string | undefined { return "attrs" in node ? node.attrs.find((item) => item.name === name)?.value : undefined; }
function text(node: Node): string { return "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(text).join("") : ""; }
function output(report: ResearchReport): Node[] { const result = build(report); assert.ok(result.html, result.gate.errors.join("\n")); return all(parse(result.html)); }
function metric(report: ResearchReport, id: string): Observation { const row = report.observations.find((item) => item.id === id); assert.ok(row); return row; }
function fixture(): ResearchReport { const input = createFixture(); for (const row of input.observations.filter((item) => item.basis !== "market")) { row.unit = "백만원"; if (row.value !== null) row.value *= 1000000; } return input; }
export function runFinancialCases(): number {
  let cases = 0;
  const check = (name: string, run: () => void): void => { run(); cases++; console.log(`PASS financial presentation: ${name}`); };
  check("three statements align ascending periods and keep citations outside numeric cells", () => {
    const report = fixture(); report.financials.reverse(); const nodes = output(report);
    const articles = nodes.filter((node) => attr(node, "data-statement")); assert.equal(articles.length, 3);
    const income = articles.find((node) => attr(node, "data-statement") === "income")!;
    const head = all(income).find((node) => "tagName" in node && node.tagName === "thead")!;
    assert.match(text(head), /202320242025/);
    for (const cell of nodes.filter((node) => "tagName" in node && node.tagName === "td" && attr(node, "class")?.includes("num"))) assert.ok(!all(cell).some((node) => attr(node, "class") === "citation"));
  });
  check("presentation converts units while preserving raw input and chart data", () => {
    const report = fixture(); const before = JSON.stringify(report); const nodes = output(report);
    const revenue = nodes.find((node) => attr(node, "data-observation-id") === "revenue.2025" && attr(node, "data-raw-value")); assert.ok(revenue);
    assert.equal(text(revenue), "1,200,000"); assert.equal(attr(revenue, "data-raw-value"), "120000000"); assert.equal(JSON.stringify(report), before);
  });
  check("negative cash flow, real zero and unavailable values remain distinct", () => {
    const report = fixture(); metric(report, "cfo.2025").value = 5000000; metric(report, "capex.2024").value = 0;
    const missing = metric(report, "capex.2023"); missing.value = null; missing.status = "missing"; missing.sourceIds = []; missing.reason = "원문 수집 실패";
    const nodes = output(report); const cell = (id: string): Node => { const row = nodes.find((node) => attr(node, "data-observation-id") === id && (attr(node, "data-raw-value") !== undefined || attr(node, "title") === "원문 수집 실패")); assert.ok(row); return row; };
    assert.equal(text(cell("fcf.2025")), "(50,000)"); assert.equal(text(cell("capex.2024")), "0"); assert.equal(text(cell("capex.2023")), "—");
  });
  check("quarter, cumulative, balance snapshot and segment scopes use separate tables", () => {
    const report = fixture(); const base = metric(report, "revenue.2025");
    const add = (id: string, kind: Observation["period"]["kind"], metricName: string, start: string, scope = base.scope): void => { report.observations.push({ ...base, id, metric: metricName, scope, period: { kind, start, end: "2026-06-30" }, observedAt: "2026-06-30T23:59:59+09:00" }); };
    add("q2", "quarter", "revenue", "2026-04-01"); add("h1", "YTD", "revenue", "2026-01-01"); add("balance", "instant", "assets", "2026-06-30"); add("segment", "quarter", "revenue", "2026-04-01", "segment-only");
    const nodes = output(report); const ids = ["q2", "h1", "balance", "segment"];
    const matching = nodes.filter((node) => attr(node, "data-statement") && all(node).some((child) => ids.includes(attr(child, "data-observation-id") ?? "")));
    assert.equal(matching.length, 4); for (const article of matching) assert.equal(all(article).filter((node) => ids.includes(attr(node, "data-observation-id") ?? "")).length, 1);
  });
  check("ambiguous optional financial cells fail instead of choosing the first value", () => {
    const report = fixture(); const base = metric(report, "revenue.2025");
    report.observations.push({ ...base, id: "cost1", metric: "costOfSales" }, { ...base, id: "cost2", metric: "costOfSales", value: 123 });
    const result = build(report); assert.equal(result.gate.status, "FAIL"); assert.equal(result.html, null); assert.match(result.gate.errors.join("\n"), /Ambiguous financial cell/);
  });
  check("small nonzero financial values are not rounded into zero", () => {
    const report = createFixture(); const nodes = output(report);
    const revenue = nodes.find((node) => attr(node, "data-observation-id") === "revenue.2025" && attr(node, "data-raw-value")); assert.ok(revenue); assert.notEqual(text(revenue), "0"); assert.match(text(revenue), /e-/);
  });
  check("all source-number links resolve to the same original source record", () => {
    const nodes = output(fixture()); const ids = new Set(nodes.map((node) => attr(node, "id")));
    for (const link of nodes.filter((node) => attr(node, "class") === "citation")) { const href = attr(link, "href"); assert.ok(href); assert.ok(href.startsWith("#source-")); assert.ok(ids.has(href.slice(1))); }
  });
  check("optional balance accounts cannot masquerade as cash-flow periods", () => {
    const report = fixture(); report.observations.push({ ...metric(report, "revenue.2025"), id: "invalid-receivables", metric: "receivables" });
    const result = build(report); assert.equal(result.gate.status, "FAIL"); assert.match(result.gate.errors.join("\n"), /Financial stock requires instant/);
  });
  return cases;
}
