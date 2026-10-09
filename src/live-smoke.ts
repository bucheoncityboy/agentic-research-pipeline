import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { build, prepare, verify } from "../.agents/skills/company-analysis-ra/scripts/report.js";
import type { ResearchReport, Observation } from "../.agents/skills/company-analysis-ra/scripts/schema.js";

type Node = DefaultTreeAdapterMap["node"];
function text(node: Node): string {
  if ("tagName" in node && ["script", "style", "noscript"].includes(node.tagName)) return "";
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(text).join(" ").replace(/\s+/g, " ").trim() : "";
}
function descendants(node: Node, tag: string): Node[] {
  const found: Node[] = []; const nodes: Node[] = [node];
  while (nodes.length) { const next = nodes.pop(); if (!next) continue; if ("tagName" in next && next.tagName === tag) found.push(next); if ("childNodes" in next) nodes.push(...[...next.childNodes].reverse()); }
  return found;
}
const definitions = [
  { id: "annual", url: "https://www.samsung.com/global/sustainability/digital-library/facts-figures/", name: "삼성전자 Facts & Figures", publishedAt: null },
  { id: "q1", url: "https://news.samsung.com/kr/삼성전자-2026년-1분기-실적-발표", name: "삼성전자 공식 분기 실적", publishedAt: "2026-04-30" },
  { id: "q2", url: "https://news.samsung.com/kr/삼성전자-2026년-2분기-잠정실적-발표", name: "삼성전자 공식 잠정실적", publishedAt: "2026-07-07" },
] as const;

async function main(): Promise<void> {
  const root = fileURLToPath(new URL("..", import.meta.url)); const output = resolve(root, "results/live-smoke"); mkdirSync(output, { recursive: true });
  const retrieved = await Promise.allSettled(definitions.map(async (source) => {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
    return { ...source, document: parse(await response.text()), finalUrl: response.url };
  }));
  const failures = retrieved.flatMap((item, index) => item.status === "rejected" ? [{ source: definitions[index]?.id, reason: String(item.reason) }] : []);
  if (failures.length) {
    writeFileSync(resolve(output, "fetch-status.json"), JSON.stringify({ status: "FAIL", failures }, null, 2));
    throw new Error(`Live source access failed: ${JSON.stringify(failures)}`);
  }
  const pages = retrieved.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  const annual = pages.find((page) => page.id === "annual"); assert.ok(annual);
  const financialTable = descendants(annual.document, "table").map((table) => descendants(table, "tr").map((tr) => "childNodes" in tr ? tr.childNodes.filter((cell) => "tagName" in cell && ["td", "th"].includes(cell.tagName)).map(text) : [])).find((rows) => rows.some((cells) => cells[0]?.toLowerCase() === "sales") && rows.some((cells) => cells[0]?.toLowerCase() === "operating profit"));
  assert.ok(financialTable, "Official annual financial table not found; source format needs review");
  assert.deepEqual(financialTable[0]?.slice(-3), ["2023", "2024", "2025"], "Annual source years changed; do not relabel values");
  const annualValues = new Map<string, number[]>();
  for (const [metric, label] of [["revenue", "sales"], ["operatingProfit", "operating profit"], ["netIncome", "net income"]]) {
    const cells = financialTable.find((row) => row[0]?.toLowerCase() === label); assert.ok(cells);
    assert.ok(cells.some((cell) => cell.toLowerCase().replace(/\s/g, "") === "krw1trillion"), "Annual source unit changed; do not rescale silently");
    const values = cells.slice(-3).map((cell) => Number(cell.replace(/,/g, ""))); assert.ok(values.length === 3 && values.every(Number.isFinite)); annualValues.set(metric!, values);
  }
  const asOf = `${new Date(Date.now() + 9 * 3600000).toISOString().slice(0, -1)}+09:00`;
  const observations: Observation[] = []; const financials: ResearchReport["financials"] = [];
  const keys = ["revenue", "operatingProfit", "netIncome", "assets", "liabilities", "equity", "cash", "debt", "cfo", "capex"] as const;
  for (const [index, year] of [2023, 2024, 2025].entries()) {
    const metrics = {} as ResearchReport["financials"][number]["metrics"];
    for (const metric of keys) {
      const id = `${metric}.${year}`; metrics[metric] = id; const value = annualValues.get(metric)?.[index] ?? null;
      const flow = ["revenue", "operatingProfit", "netIncome", "cfo", "capex"].includes(metric);
      observations.push({ id, label: metric, metric, scope: "Samsung Electronics consolidated", value, unit: "조원", basis: "consolidated", period: { kind: flow ? "FY" : "instant", start: flow ? `${year}-01-01` : `${year}-12-31`, end: `${year}-12-31` }, observedAt: `${year}-12-31T23:59:59+09:00`, status: value === null ? "missing" : "actual", sourceIds: value === null ? [] : ["annual"], ...(value === null ? { reason: "공식 요약 페이지에 없는 계정. 이번 연결 검수에서는 추가 공시 수집을 수행하지 않음" } : {}) });
    }
    financials.push({ fiscalYear: year, metrics });
  }
  const sources: ResearchReport["sources"] = [];
  for (const page of pages) {
    const content = text(page.document);
    let excerpt = `Key Financial Performance (KRW 1 trillion), 2023/2024/2025: Sales ${annualValues.get("revenue")?.join("/")}; Operating profit ${annualValues.get("operatingProfit")?.join("/")}; Net income ${annualValues.get("netIncome")?.join("/")}`;
    if (page.id !== "annual") {
      assert.ok(content.includes(page.publishedAt!.replace(/-/g, "/")), `Article publication date needs review: ${page.id}`);
      const match = /삼성전자[가는]?\s*연결\s*기준(?:으로)?\s*매출\s*([\d.]+)\s*조원[,，]?\s*영업이익\s*([\d.]+)\s*조원/.exec(content);
      assert.ok(match, `Quarter release extraction failed: ${page.id}`);
      excerpt = match[0];
      const quarter = page.id === "q1" ? { start: "2026-01-01", end: "2026-03-31" } : { start: "2026-04-01", end: "2026-06-30" };
      for (const [metric, value] of [["revenue", Number(match[1])], ["operatingProfit", Number(match[2])]] as const) observations.push({ id: `${metric}.${page.id}`, label: metric, metric, scope: "Samsung Electronics consolidated", value, unit: "조원", basis: "consolidated", period: { kind: "quarter", ...quarter }, observedAt: `${quarter.end}T23:59:59+09:00`, status: page.id === "q1" ? "actual" : "preliminary", sourceIds: [page.id] });
    }
    sources.push({ id: page.id, name: page.name, url: page.finalUrl, publishedAt: page.publishedAt, collectedAt: asOf, locator: page.id === "annual" ? "Key Financial Performance 표, 연간 열 순서" : "공식 실적 발표 첫 문단", excerpt, access: "direct" });
  }
  const q1 = observations.find((row) => row.id === "revenue.q1"); assert.ok(q1);
  observations.push({ ...q1, id: "revenue.h1", label: "상반기 매출 합계", value: null, status: "preliminary", sourceIds: [], period: { kind: "YTD", start: "2026-01-01", end: "2026-06-30" }, formula: { operation: "sum", inputs: ["revenue.q1", "revenue.q2"] } });
  observations.push({ id: "price", label: "현재가", metric: "price", scope: "Samsung Electronics common stock", value: null, unit: "KRW", basis: "market", observedAt: asOf, period: { kind: "instant", start: asOf.slice(0, 10), end: asOf.slice(0, 10) }, status: "missing", sourceIds: [], reason: "이번 연결 검수 범위는 공식 실적 페이지이며 시세 수집은 수행하지 않음" });
  const report: ResearchReport = {
    schemaVersion: "3.1", asOf, fixture: false, company: { name: "삼성전자 — 공식자료 연결 검수", ticker: "005930", market: "KRX-KOSPI", currency: "KRW", sector: "반도체·전자", fiscalYearEnd: "12-31" }, sources, observations, financials, priceId: "price", summaryIds: ["revenue.2025", "operatingProfit.2025", "revenue.h1"], brokers: [], consensusId: null,
    profile: [{ kind: "fact", text: "삼성전자 공식 실적 페이지의 연결 재무를 사용한 부분 입력 검수입니다.", sourceIds: ["annual"], literalTerms: [] }],
    narrative: [{ kind: "fact", text: "연간 매출은 {{obs:revenue.2025}}, 영업이익은 {{obs:operatingProfit.2025}}입니다.", sourceIds: [], literalTerms: [] }],
    indicators: [], derivatives: [], debates: [], news: [{ title: "공식 분기 실적", sourceId: "q1" }, { title: "공식 잠정실적", sourceId: "q2" }], calendar: [],
    charts: [{ id: "annual-revenue", title: "공식 연간 매출", type: "line", labels: ["2023-12-31", "2024-12-31", "2025-12-31"], datasets: [{ label: "매출 (조원)", observationIds: ["revenue.2023", "revenue.2024", "revenue.2025"] }] }],
    conclusion: [{ kind: "interpretation", text: "공식 분기 자료를 합산한 상반기 매출은 {{obs:revenue.h1}}입니다.", sourceIds: [], caveat: "잠정 수치가 포함됩니다. 재무상태·현금흐름·시세 미확보를 표시한 부분 검수이며 완성된 기업분석 보고서가 아닙니다.", literalTerms: [] }],
  };
  const result = build(report); assert.ok(result.html, result.gate.errors.join("\n")); assert.equal(result.gate.status, "PARTIAL");
  const prepared = prepare(report); assert.ok(prepared.report); const sum = prepared.report.observations.find((row) => row.id === "revenue.h1")?.value;
  assert.ok(sum !== undefined && sum !== null); assert.ok(Math.abs(sum - ((q1.value ?? 0) + (observations.find((row) => row.id === "revenue.q2")?.value ?? 0))) < 1e-8);
  assert.notEqual(verify(report, result.html).status, "FAIL");
  for (const [file, content] of [["input.json", JSON.stringify(report, null, 2)], ["report.html", result.html], ["report.html.gate.json", JSON.stringify(result.gate, null, 2)], ["fetch-status.json", JSON.stringify({ status: "PASS", sources: pages.map((page) => ({ id: page.id, url: page.finalUrl })), sum, pipelineStatus: result.gate.status }, null, 2)]]) writeFileSync(resolve(output, file!), content!, "utf8");
  console.log(JSON.stringify({ liveSources: pages.length, observedNumbers: observations.filter((row) => row.value !== null).length, halfYearRevenue: sum, status: result.gate.status, report: resolve(output, "report.html") }, null, 2));
}
main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  const output = fileURLToPath(new URL("../results/live-smoke/", import.meta.url)); mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, "fetch-status.json"), JSON.stringify({ status: "FAIL", reason }, null, 2)); console.error(reason); process.exitCode = 1;
});
