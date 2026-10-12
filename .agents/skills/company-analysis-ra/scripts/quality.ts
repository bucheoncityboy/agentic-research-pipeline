import { researchTopics, type ResearchReport, type ResearchTopic } from "./schema.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
export function rendererFingerprint(): string {
  return digest(["report.ts", "schema.ts", "financials.ts", "quality.ts", "../assets/template.html"].map((path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n")).join("\n"));
}
export function evidenceFingerprint(report: ResearchReport): string {
  const { research, ...data } = report;
  const observations = [...data.observations].sort((a, b) => a.id.localeCompare(b.id)).map((row) => {
    if (!row.formula) return row;
    const { value: _value, sourceIds: _sources, status: _status, reason: _reason, ...definition } = row;
    return definition;
  });
  return digest(JSON.stringify(canonical({ ...data, observations, ...(research ? { scope: { profile: research.profile, scopeReason: research.scopeReason, financialModel: research.financialModel, output: research.output, coverage: research.coverage } } : {}) })));
}

export const topicLabels: Record<ResearchTopic, string> = { business: "기업·사업", financials: "재무제표", valuation: "밸류에이션", consensus: "컨센서스", industry: "산업·경쟁", events: "공시·일정", conclusion: "결론·반증 조건", technical: "기술지표", flows: "수급·파생" };
const core: ResearchTopic[] = ["business", "financials", "industry", "events", "conclusion"];
const extraAnnual = ["costOfSales", "grossProfit", "sga", "profitBeforeTax", "incomeTax", "currentAssets", "nonCurrentAssets", "currentLiabilities", "nonCurrentLiabilities", "receivables", "inventory", "cfi", "cff", "operatingMargin", "netDebt", "fcf"];
export type Assessment = { requiredTopics: ResearchTopic[]; errors: string[]; gaps: string[]; missingReviewIds: string[] };
export function assessResearch(report: ResearchReport): Assessment {
  const research = report.research;
  const result: Assessment = { requiredTopics: research?.profile === "fundamentals" ? [...core] : [...core, "valuation", "consensus"], errors: [], gaps: [], missingReviewIds: [] };
  if (!research) { if (report.schemaVersion === "3.2") result.gaps.push("조사 범위·검수 기록 미작성"); return result; }
  const observations = new Map(report.observations.map((row) => [row.id, row]));
  const sources = new Set(report.sources.map((row) => row.id));
  const references = (sourceIds: string[], observationIds: string[], context: string): void => {
    for (const id of sourceIds) if (!sources.has(id)) result.errors.push(`${context}: unknown source ${id}`);
    for (const id of observationIds) if (!observations.has(id)) result.errors.push(`${context}: unknown observation ${id}`);
  };
  for (const coverage of research.coverage) {
    references(coverage.sourceIds, coverage.observationIds, `coverage.${coverage.topic}`);
    if (research.coverage.filter((row) => row.topic === coverage.topic).length !== 1) result.errors.push(`Duplicate coverage topic: ${coverage.topic}`);
    if (coverage.status === "unavailable" && !coverage.attempts.length) result.errors.push(`Unavailable topic requires source attempts: ${coverage.topic}`);
    if (coverage.status === "done" && !coverage.sourceIds.length && !coverage.observationIds.some((id) => observations.get(id)?.value !== null && observations.has(id))) result.errors.push(`Completed coverage lacks evidence: ${coverage.topic}`);
    if (coverage.status === "not-applicable" && result.requiredTopics.includes(coverage.topic) && !coverage.sourceIds.length) result.gaps.push(`${topicLabels[coverage.topic]} 미적용의 원문 근거 미확보`);
  }
  for (const topic of result.requiredTopics) {
    const coverage = research.coverage.find((row) => row.topic === topic);
    if (!coverage || coverage.status === "unavailable") result.gaps.push(`${topicLabels[topic]} 조사 미완료`);
    if (coverage?.status === "done") {
      if (coverage.observationIds.some((id) => observations.get(id)?.status === "missing")) result.gaps.push(`${topicLabels[topic]}에 미확보 관측치가 있음`);
      const content = topic === "business" ? report.profile.length : topic === "industry" ? report.indicators.length : topic === "events" ? report.news.length + report.calendar.length : topic === "conclusion" ? report.conclusion.filter((claim) => claim.kind === "interpretation" && claim.caveat).length : topic === "valuation" ? report.valuation?.length ?? 0 : topic === "consensus" ? report.consensusId && observations.get(report.consensusId)?.value !== null ? 1 : 0 : 1;
      if (!content) result.gaps.push(`${topicLabels[topic]}의 분석 본문·실제 자료 미작성`);
    }
  }
  if (!report.executive?.length) result.gaps.push("핵심 판단과 확인 조건 요약 미작성");
  if (!report.narrative.length) result.gaps.push("실적 변화 원인 분석 미작성");
  if (!report.debates.some((row) => row.bull.length && row.bear.length)) result.gaps.push("근거 있는 양면 쟁점 미작성");
  const latestYear = Math.max(...report.financials.map((year) => year.fiscalYear));
  const anchor = observations.get(report.financials.find((year) => year.fiscalYear === latestYear)!.metrics.revenue);
  if (research.financialModel === "non-financial") {
    for (const year of report.financials) {
      const fiscalEnd = observations.get(year.metrics.revenue)?.period.end;
      const stocks = ["currentAssets", "nonCurrentAssets", "currentLiabilities", "nonCurrentLiabilities", "receivables", "inventory", "netDebt"];
      const missing = extraAnnual.filter((metric) => !report.observations.some((row) => row.metric === metric && row.period.kind === (stocks.includes(metric) ? "instant" : "FY") && row.period.end === fiscalEnd && row.scope === anchor?.scope && row.basis === anchor?.basis && row.unit === (metric === "operatingMargin" ? "%" : anchor?.unit) && (row.value !== null || row.status === "not-applicable")));
      if (missing.length) result.gaps.push(`FY${year.fiscalYear} 상세 재무 미확보: ${missing.join(", ")}`);
    }
  } else {
    const extras = report.financialRows?.filter((row) => !["revenue", "operatingProfit", "netIncome", "assets", "liabilities", "equity", "cash", "debt", "cfo", "capex"].includes(row.metric)) ?? [];
    if (!extras.length) result.gaps.push("금융업에 맞는 보완 계정·표 미작성");
    for (const year of report.financials) for (const extra of extras) {
      if (!report.observations.some((row) => row.metric === extra.metric && row.period.end === observations.get(year.metrics.revenue)?.period.end && row.period.kind === (extra.statement === "balance" ? "instant" : "FY") && row.scope === anchor?.scope && row.basis === anchor?.basis && (row.value !== null || row.status === "not-applicable"))) result.gaps.push(`FY${year.fiscalYear} 금융업 계정 미확보: ${extra.metric}`);
    }
  }
  if (!report.observations.some((row) => row.scope === anchor?.scope && row.basis === anchor?.basis && ["quarter", "YTD"].includes(row.period.kind) && row.period.end > (anchor?.period.end ?? "") && row.metric === "revenue" && row.value !== null && ["actual", "preliminary"].includes(row.status) && report.observations.some((profit) => profit.metric === "operatingProfit" && profit.scope === row.scope && profit.basis === row.basis && profit.value !== null && ["actual", "preliminary"].includes(profit.status) && JSON.stringify(profit.period) === JSON.stringify(row.period)))) result.gaps.push("최신 분기·누적 매출·영업이익 미확보");
  for (const check of research.checks) {
    references(check.sourceIds, check.observationIds, `review.${check.kind}`);
    if (research.checks.filter((row) => row.kind === check.kind).length !== 1) result.errors.push(`Duplicate review check: ${check.kind}`);
    if (check.status === "done" && check.reviewedAt === null) result.errors.push(`Review completion requires timestamp: ${check.kind}`);
    if (check.status === "done" && check.evidenceSha256 !== evidenceFingerprint(report)) result.gaps.push(`${check.kind} 검수 이후 입력 변경 또는 입력 지문 미기록`);
    if (check.status === "done" && check.kind !== "sources" && check.rendererSha256 !== rendererFingerprint()) result.gaps.push(`${check.kind} 검수 이후 생성기 변경 또는 버전 지문 미기록`);
  }
  for (const kind of ["sources", "desktop", "mobile", ...(research.output === "print-ready" ? ["print"] : [])]) {
    if (research.checks.find((row) => row.kind === kind)?.status !== "done") result.gaps.push(`${kind} 검수 미완료`);
  }
  const sourceReview = research.checks.find((row) => row.kind === "sources");
  {
    const checked = new Set(sourceReview?.evidenceSha256 === evidenceFingerprint(report) ? sourceReview.observationIds : []);
    result.missingReviewIds = report.observations.filter((row) => row.value !== null && !row.formula && !checked.has(row.id)).map((row) => row.id);
    if (result.missingReviewIds.length) result.gaps.push(`원자료 숫자 ${result.missingReviewIds.length}개 대조 기록 미확보`);
    const missingSources = report.sources.filter((row) => !sourceReview?.sourceIds.includes(row.id));
    if (missingSources.length) result.gaps.push(`원문 ${missingSources.length}건 확인 기록 미확보`);
  }
  result.errors = [...new Set(result.errors)]; result.gaps = [...new Set(result.gaps)];
  return result;
}
export function coverageRows(report: ResearchReport): Array<{ topic: ResearchTopic; label: string; required: boolean; status: string; reason: string }> {
  const assessment = assessResearch(report);
  return researchTopics.map((topic) => {
    const row = report.research?.coverage.find((item) => item.topic === topic);
    return { topic, label: topicLabels[topic], required: assessment.requiredTopics.includes(topic), status: row?.status ?? "not-recorded", reason: row?.reason ?? "조사 기록 미작성" };
  });
}
