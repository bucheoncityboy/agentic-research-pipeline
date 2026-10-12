import type { Observation, ResearchReport } from "../.agents/skills/company-analysis-ra/scripts/schema.js";
import { evidenceFingerprint, rendererFingerprint } from "../.agents/skills/company-analysis-ra/scripts/quality.js";
import { createFixture } from "./fixture.js";

// Synthetic behavior fixture; never collected company data.
export function createResearchFixture(): ResearchReport {
  const report = createFixture(); report.schemaVersion = "3.2";
  const find = (id: string): Observation => { const row = report.observations.find((item) => item.id === id); if (!row) throw new Error(id); return row; };
  for (const year of [2023, 2024, 2025]) {
    const revenue = find(`revenue.${year}`); const assets = find(`assets.${year}`);
    const amounts = { costOfSales: revenue.value! * .6, grossProfit: revenue.value! * .4, sga: revenue.value! * .4 - 20, profitBeforeTax: 20, incomeTax: 5, currentAssets: 80, nonCurrentAssets: 120, currentLiabilities: 40, nonCurrentLiabilities: 40, receivables: 30, inventory: 20, cfi: -25, cff: -5 };
    for (const [metric, value] of Object.entries(amounts)) {
      const stock = ["currentAssets", "nonCurrentAssets", "currentLiabilities", "nonCurrentLiabilities", "receivables", "inventory"].includes(metric);
      report.observations.push({ ...(stock ? assets : revenue), id: `${metric}.${year}`, metric, label: `가상 ${metric}`, value });
    }
    report.observations.push({ ...revenue, id: `margin.${year}`, metric: "operatingMargin", label: "가상 영업이익률", unit: "%", value: null, sourceIds: [], formula: { operation: "ratio-percent", inputs: [`operatingProfit.${year}`, revenue.id] } }, { ...assets, id: `netDebt.${year}`, metric: "netDebt", label: "가상 순차입금", value: null, sourceIds: [], formula: { operation: "difference", inputs: [`debt.${year}`, `cash.${year}`] } });
    if (year !== 2025) report.observations.push({ ...revenue, id: `fcf.${year}`, metric: "fcf", label: "가상 FCF", value: null, sourceIds: [], formula: { operation: "difference", inputs: [`cfo.${year}`, `capex.${year}`] } });
  }
  report.sources.push({ id: "interim-source", name: "가상 분기 공시", url: "https://example.com/interim", publishedAt: "2026-07-30", collectedAt: report.asOf, locator: "가상 분기 표", excerpt: "실제 공시가 아닌 실행용 예제", access: "direct" });
  report.observations.push({ ...find("operatingProfit.2025"), id: "operatingProfit.q2", label: "가상 분기 영업이익", value: 8, period: { kind: "quarter", start: "2026-04-01", end: "2026-06-30" }, observedAt: "2026-06-30T23:59:59+09:00", sourceIds: ["interim-source"] });
  report.observations.push({ ...find("revenue.2025"), id: "revenue.q2", label: "가상 분기 매출", value: 40, period: { kind: "quarter", start: "2026-04-01", end: "2026-06-30" }, observedAt: "2026-06-30T23:59:59+09:00", sourceIds: ["interim-source"] }, { ...find("price"), id: "per", label: "가상 제공사 PER", metric: "per", value: 18.5, unit: "배" });
  report.executive = [{ kind: "interpretation", text: "매출 {{obs:revenue.2025}}와 FCF {{obs:fcf.2025}}를 함께 확인하는 가상 연구 사례입니다.", sourceIds: [], caveat: "가상 자료이며 실제 기업 판단에 사용할 수 없습니다.", literalTerms: [] }];
  report.valuation = [{ kind: "fact", text: "가상 제공사 PER은 {{obs:per}}입니다. 제공 기준을 연결하는 입력 구조 예시입니다.", sourceIds: ["market-source"], literalTerms: [] }];
  report.indicators = [{ kind: "fact", text: "산업과 경쟁 근거를 연결하는 가상 사례입니다.", sourceIds: ["financial-source"], literalTerms: [] }];
  report.debates[0]!.bear = [{ kind: "interpretation", text: "가상 사례의 FCF {{obs:fcf.2025}}는 투자 지출 시점에 민감합니다.", sourceIds: [], caveat: "실제 전망이 아닌 입력 구조 검사이며 투자 지출이 달라지면 해석도 바뀝니다.", literalTerms: [] }];
  report.news = [{ title: "가상 분기 공시", sourceId: "interim-source" }];
  report.calendar = [{ date: "2026-10-30", title: "가상 발표 일정", status: "confirmed", sourceIds: ["interim-source"] }];
  const required = ["business", "financials", "valuation", "consensus", "industry", "events", "conclusion"] as const;
  report.research = { profile: "standard", intent: "final", scopeReason: "표준 기업분석 계약을 검사하는 가상 예시. 실제 조사 완료 기록이 아닙니다.", financialModel: "non-financial", output: "html", coverage: required.map((topic) => ({ topic, status: "done", reason: "가상 입력의 구조·완료 조건 검사", sourceIds: ["financial-source"], observationIds: topic === "consensus" ? ["target.mean"] : topic === "valuation" ? ["per"] : [], attempts: [] })), checks: [] };
  stampFixtureReviews(report);
  return report;
}
export function stampFixtureReviews(report: ResearchReport): void {
  if (!report.research) throw new Error("Research fixture required");
  const evidenceSha256 = evidenceFingerprint(report); const rendererSha256 = rendererFingerprint();
  report.research.checks = ["sources", "desktop", "mobile", "print"].map((kind) => ({ kind: kind as "sources" | "desktop" | "mobile" | "print", status: kind === "print" ? "not-applicable" : "done", reviewedAt: kind === "print" ? null : report.asOf, record: "가상 검수 기록: 동작 검사 전용이며 실제 원문·브라우저 검수의 증거가 아님", sourceIds: kind === "sources" ? report.sources.map((row) => row.id) : [], observationIds: kind === "sources" ? report.observations.filter((row) => row.value !== null && !row.formula).map((row) => row.id) : [], evidenceSha256, rendererSha256 }));
}
