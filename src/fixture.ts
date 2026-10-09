import { type ResearchReport, type Observation } from "../docs/scripts/schema.js";

export function createFixture(): ResearchReport {
  const asOf = "2026-10-09T09:00:00+09:00";
  const snapshot = { kind: "instant", start: "2026-10-08", end: "2026-10-08" } as const;
  const observations: Observation[] = [];
  const financials: ResearchReport["financials"] = [];
  for (const year of [2023, 2024, 2025]) {
    const values = { revenue: 100 + (year - 2023) * 10, operatingProfit: 20, netIncome: 15, assets: 200, liabilities: 80, equity: 120, cash: 20, debt: 60, cfo: 35, capex: 10 };
    const metricIds = {} as ResearchReport["financials"][number]["metrics"];
    for (const [metric, value] of Object.entries(values)) {
      const observationId = `${metric}.${year}`;
      metricIds[metric as keyof typeof metricIds] = observationId;
      const flow = ["revenue", "operatingProfit", "netIncome", "cfo", "capex"].includes(metric);
      observations.push({ id: observationId, label: metric, metric, scope: "fixture-company", value, unit: "KRW", basis: "consolidated", period: { kind: flow ? "FY" : "instant", start: flow ? `${year}-01-01` : `${year}-12-31`, end: `${year}-12-31` }, observedAt: `${year}-12-31T23:59:59+09:00`, status: "actual", sourceIds: ["financial-source"] });
    }
    financials.push({ fiscalYear: year, metrics: metricIds });
  }
  const market = (id: string, metric: string, value: number | null, reason?: string): Observation => ({
    id, label: id, metric, value, scope: "fixture-company", unit: "KRW", basis: "market", period: snapshot,
    observedAt: "2026-10-08T15:30:00+09:00", status: value === null ? "missing" : metric === "price" ? "actual" : "estimate",
    sourceIds: value === null ? [] : ["market-source"], ...(reason ? { reason } : {}),
  });
  observations.push(market("price", "price", 33700), market("target.kb", "targetPrice", 44000), market("target.nh", "targetPrice", 61000), market("target.yuanta", "targetPrice", 60000), market("target.sk", "targetPrice", null, "가상 사례: 원문 목표가 미확보"));
  observations.push({ ...market("target.mean", "targetPrice", null), status: "estimate", formula: { operation: "mean", inputs: ["target.kb", "target.nh", "target.yuanta", "target.sk"] } });
  observations.push({ ...market("upside", "upside", null), unit: "%", status: "estimate", formula: { operation: "upside", inputs: ["target.mean", "price"] } });
  observations.push({ ...observations.find((row) => row.id === "cfo.2025") as Observation, id: "fcf.2025", label: "FCF", metric: "fcf", value: null, sourceIds: [], formula: { operation: "difference", inputs: ["cfo.2025", "capex.2025"] } });
  return {
    schemaVersion: "3.1", asOf, fixture: true,
    company: { name: "가상 기업 — 실행 검증용", ticker: "000000", market: "KRX-KOSPI", currency: "KRW", sector: "가상 산업", fiscalYearEnd: "12-31" },
    sources: [
      { id: "financial-source", name: "가상 연간 공시", url: "https://example.com/financials", publishedAt: "2026-02-02T09:00:00+09:00", collectedAt: asOf, locator: "가상 재무제표 표", excerpt: "테스트용 수치이며 실제 기업 공시가 아닙니다.", access: "direct" },
      { id: "market-source", name: "가상 시세·하우스 원문", url: "https://example.com/market", publishedAt: "2026-10-08T16:00:00+09:00", collectedAt: asOf, locator: "가상 시세·목표가 표", excerpt: "가상 목표가는 KB 44000, NH 61000, 유안타 60000이며 SK는 미확보입니다.", access: "direct" },
    ],
    observations, priceId: "price", summaryIds: ["price", "target.mean", "upside", "fcf.2025"], financials,
    brokers: ["kb", "nh", "yuanta", "sk"].map((name) => ({ name, targetId: `target.${name}`, opinion: name === "sk" ? "미확보" : "외부 BUY (가상)", sourceId: "market-source" })),
    consensusId: "target.mean",
    charts: [{ id: "target-chart", title: "가상 하우스별 목표가", type: "bar", labels: ["kb", "nh", "yuanta", "sk"], datasets: [{ label: "외부 목표가", observationIds: ["target.kb", "target.nh", "target.yuanta", "target.sk"] }] }],
    profile: [{ kind: "fact", text: "이 기업과 모든 수치는 실행 검증용 가상 자료입니다.", sourceIds: ["financial-source"], literalTerms: [] }],
    narrative: [{ kind: "fact", text: "매출액은 {{obs:revenue.2025}}이며 영업이익은 {{obs:operatingProfit.2025}}입니다.", sourceIds: [], literalTerms: [] }],
    indicators: [], derivatives: [],
    debates: [{ title: "현금 창출의 지속성", bull: [{ kind: "interpretation", text: "영업현금흐름 {{obs:cfo.2025}}에서 CAPEX {{obs:capex.2025}}를 차감한 FCF는 {{obs:fcf.2025}}입니다.", sourceIds: [], caveat: "가상 사례입니다. 운전자본 회수 시점이 바뀌면 현금흐름도 달라집니다.", literalTerms: [] }], bear: [] }],
    news: [], calendar: [],
    conclusion: [{ kind: "interpretation", text: "확인 가능한 하우스 목표가의 평균은 {{obs:target.mean}}입니다. 미확보 목표가는 계산에서 제외했습니다.", sourceIds: [], caveat: "목표가는 외부 전망이며 실제 수익이나 적정가를 보장하지 않습니다.", literalTerms: [] }],
  };
}
