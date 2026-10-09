import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { reportSchema, type ResearchReport, type Observation, type Claim, type Gate } from "./schema.js";

const templatePath = fileURLToPath(new URL("../template.html", import.meta.url));
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const unique = (values: string[]): string[] => [...new Set(values)];
const htmlEscape = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
const format = (observation: Observation): string => observation.value === null ? `미확보: ${observation.reason ?? "입력 근거 없음"}` : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(observation.value)} ${observation.unit}`;
const statusLabels = { actual: "실제", preliminary: "잠정", estimate: "전망", missing: "미확보", "not-applicable": "미적용" };
const financialKeys = ["revenue", "operatingProfit", "netIncome", "assets", "liabilities", "equity", "cash", "debt", "cfo", "capex"] as const;
const financialLabels = ["매출액", "영업이익", "당기순이익", "자산", "부채", "자본", "현금", "이자부 차입금", "영업현금흐름", "CAPEX"];
const kinds = { fact: "사실", "external-view": "외부 전망", interpretation: "에이전트 해석" };
const tokenPattern = /\{\{obs:([a-zA-Z][a-zA-Z0-9_.-]*)\}\}/g;
const tradeAction = /(?:매수|매도)\s*(?:추천|기회|진입)|분할\s*매수|적극적\s*매수|비중\s*(?:확대|축소|조절)|손절|목표\s*수익|수익\s*보장/;
const samePeriod = (left: Observation, right: Observation): boolean => JSON.stringify(left.period) === JSON.stringify(right.period);

export function prepare(input: unknown): { report: ResearchReport | null; gate: Gate } {
  const gate: Gate = { status: "FAIL", errors: [], warnings: [], missingRequiredIds: [], inputSha256: hash(JSON.stringify(input)), outputSha256: null, verificationScope: "입력 구조·시점·출처 연결·계산·렌더링 검사. 원문 진위 및 실제 링크 응답은 별도 대조 필요." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    gate.errors.push(...parsed.error.issues.map((issue) => `SCHEMA ${issue.path.join(".")}: ${issue.message}`));
    return { report: null, gate };
  }
  const report = parsed.data;
  const sources = new Map(report.sources.map((source) => [source.id, source]));
  const observations = new Map(report.observations.map((observation) => [observation.id, observation]));
  if (sources.size !== report.sources.length) gate.errors.push("Duplicate source ID");
  if (observations.size !== report.observations.length) gate.errors.push("Duplicate observation ID");
  const asOf = Date.parse(report.asOf);
  if (report.company.market.startsWith("KR") && !/^\d{6}$/.test(report.company.ticker)) gate.errors.push("KR ticker must have six digits");
  if (!/^\d{2}-\d{2}$/.test(report.company.fiscalYearEnd) || !Number.isFinite(Date.parse(`2024-${report.company.fiscalYearEnd}T00:00:00Z`))) gate.errors.push("Invalid fiscal year end");
  const checkSources = (ids: string[], context: string): void => {
    for (const sourceId of ids) if (!sources.has(sourceId)) gate.errors.push(`${context}: unknown source ${sourceId}`);
  };
  const get = (observationId: string, context: string): Observation | undefined => {
    const observation = observations.get(observationId);
    if (!observation) gate.errors.push(`${context}: unknown observation ${observationId}`);
    return observation;
  };
  for (const source of report.sources) {
    const dateOnly = source.publishedAt.length === 10;
    if (dateOnly ? source.publishedAt > report.asOf.slice(0, 10) : Date.parse(source.publishedAt) > asOf) gate.errors.push(`Future publication: ${source.id}`);
    if (dateOnly ? source.collectedAt.slice(0, 10) < source.publishedAt : Date.parse(source.collectedAt) < Date.parse(source.publishedAt)) gate.errors.push(`Collected before publication: ${source.id}`);
    if (source.publishedAt.length === 10 && source.publishedAt === report.asOf.slice(0, 10)) gate.warnings.push(`${source.id}: 당일 공개 시각 미확인`);
    if (source.access === "secondary" && !source.originalUrl) gate.errors.push(`Secondary source lacks original URL: ${source.id}`);
  }
  for (const observation of report.observations) {
    checkSources(observation.sourceIds, observation.id);
    if (Date.parse(observation.observedAt) > asOf) gate.errors.push(`Future observation: ${observation.id}`);
    if (observation.period.start > observation.period.end) gate.errors.push(`Reversed period: ${observation.id}`);
    if (["missing", "not-applicable"].includes(observation.status)) {
      if (observation.value !== null || observation.formula || !observation.reason) gate.errors.push(`Missing/not-applicable requires null, reason and no formula: ${observation.id}`);
    } else if (!observation.formula && (observation.value === null || observation.sourceIds.length === 0)) {
      gate.errors.push(`Observed value requires numeric value and source: ${observation.id}`);
    }
    if (observation.status === "not-applicable" && financialKeys.includes(observation.metric as typeof financialKeys[number]) && !["cfo", "capex"].includes(observation.metric)) gate.errors.push(`Core financial metric cannot be marked not-applicable: ${observation.id}`);
    if (observation.status !== "estimate" && observation.period.end > report.asOf.slice(0, 10)) gate.errors.push(`Actual period beyond cutoff: ${observation.id}`);
    if (observation.metric === "rsi" && observation.value !== null && (observation.value < 0 || observation.value > 100)) gate.errors.push(`RSI outside 0..100: ${observation.id}`);
  }
  const resolved = new Set<string>();
  const visiting = new Set<string>();
  function calculate(observation: Observation): void {
    if (!observation.formula || resolved.has(observation.id)) return;
    if (visiting.has(observation.id)) { gate.errors.push(`Formula cycle: ${observation.id}`); return; }
    visiting.add(observation.id);
    const { operation, inputs } = observation.formula;
    if (unique(inputs).length !== inputs.length) gate.errors.push(`Duplicate formula input: ${observation.id}`);
    const rows = inputs.flatMap((observationId) => { const row = get(observationId, observation.id); return row ? [row] : []; });
    for (const row of rows) calculate(row);
    if (rows.some((row) => row.basis !== observation.basis || row.scope !== observation.scope)) gate.errors.push(`Formula basis/scope mismatch: ${observation.id}`);
    if (rows.some((row) => row.unit !== rows[0]?.unit)) gate.errors.push(`Formula input unit mismatch: ${observation.id}`);
    if (operation !== "upside" && operation !== "ratio-percent" && rows.some((row) => row.unit !== observation.unit)) gate.errors.push(`Formula output unit mismatch: ${observation.id}`);
    if ((operation === "upside" || operation === "ratio-percent") && observation.unit !== "%") gate.errors.push(`Ratio output must use %: ${observation.id}`);
    if (operation === "ratio-percent" && rows.some((row) => !samePeriod(row, observation))) gate.errors.push(`Ratio period mismatch: ${observation.id}`);
    if (operation === "mean" && rows.some((row) => !samePeriod(row, observation) || row.metric !== observation.metric)) gate.errors.push(`Mean period/metric mismatch: ${observation.id}`);
    if (operation === "sum") {
      const ordered = [...rows].sort((left, right) => left.period.start.localeCompare(right.period.start));
      if (ordered[0]?.period.start !== observation.period.start || ordered.at(-1)?.period.end !== observation.period.end || rows.some((row) => row.metric !== observation.metric)) gate.errors.push(`Sum period/metric mismatch: ${observation.id}`);
      for (let index = 1; index < ordered.length; index++) {
        const previous = ordered[index - 1]; const current = ordered[index];
        if (previous && current && Date.parse(current.period.start) - Date.parse(previous.period.end) !== 86400000) gate.errors.push(`Sum periods overlap or have gaps: ${observation.id}`);
      }
    }
    if (operation === "difference" && rows.length === 2) {
      const [left, right] = rows;
      if (left && right && !samePeriod(left, right)) {
        const isQuarterFromYtd = left.metric === right.metric && left.period.kind === "YTD" && right.period.kind === "YTD" && left.period.start === right.period.start && Date.parse(observation.period.start) - Date.parse(right.period.end) === 86400000 && observation.period.end === left.period.end;
        if (!isQuarterFromYtd) gate.errors.push(`Difference period mismatch: ${observation.id}`);
      } else if (left && !samePeriod(left, observation)) gate.errors.push(`Difference output period mismatch: ${observation.id}`);
    }
    const numericRows = rows.filter((row) => row.value !== null);
    let computed: number | null = null;
    if (rows.length === inputs.length && (operation === "mean" ? numericRows.length > 0 : numericRows.length === rows.length)) {
      const values = numericRows.map((row) => row.value as number);
      if (operation === "mean") computed = values.reduce((sum, value) => sum + value, 0) / values.length;
      if (operation === "sum") computed = values.reduce((sum, value) => sum + value, 0);
      if (["difference", "upside", "ratio-percent"].includes(operation)) {
        if (values.length !== 2) gate.errors.push(`Binary formula requires two inputs: ${observation.id}`);
        else if (values[0] !== undefined && values[1] !== undefined) {
          if (operation === "difference") computed = values[0] - values[1];
          else if (values[1] === 0) gate.errors.push(`Zero denominator: ${observation.id}`);
          else computed = (operation === "upside" ? values[0] / values[1] - 1 : values[0] / values[1]) * 100;
        }
      }
    }
    if (computed !== null && !Number.isFinite(computed)) gate.errors.push(`Nonfinite result: ${observation.id}`);
    if (observation.value !== null) gate.errors.push(`Derived value must be null before calculation: ${observation.id}`);
    observation.value = computed;
    observation.sourceIds = unique(rows.flatMap((row) => row.sourceIds));
    if (computed === null) { observation.status = "missing"; observation.reason = "계산 입력 미확보"; }
    if (rows.some((row) => row.status === "estimate") && computed !== null) observation.status = "estimate";
    else if (rows.some((row) => row.status === "preliminary") && computed !== null) observation.status = "preliminary";
    visiting.delete(observation.id); resolved.add(observation.id);
  }
  for (const observation of report.observations) calculate(observation);
  const mandatory = [report.priceId];
  const years = report.financials.map((row) => row.fiscalYear).sort((left, right) => left - right);
  if (unique(years.map(String)).length !== 3 || years[1] !== (years[0] ?? 0) + 1 || years[2] !== (years[1] ?? 0) + 1) gate.errors.push("Financial years must be three consecutive completed fiscal years");
  const cutoffYear = Number(report.asOf.slice(0, 4));
  const latestCompletedYear = report.asOf.slice(0, 10) >= `${cutoffYear}-${report.company.fiscalYearEnd}` ? cutoffYear : cutoffYear - 1;
  if (years.at(-1) !== latestCompletedYear) gate.errors.push("Financial years must end with the latest completed fiscal year");
  for (const row of report.financials) {
    const annualRows: Observation[] = [];
    const expectedStart = new Date(Date.parse(`${row.fiscalYear - 1}-${report.company.fiscalYearEnd}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    for (const key of financialKeys) {
      const observationId = row.metrics[key]; mandatory.push(observationId);
      const observation = get(observationId, `FY${row.fiscalYear}.${key}`);
      if (observation) annualRows.push(observation);
      const flow = ["revenue", "operatingProfit", "netIncome", "cfo", "capex"].includes(key);
      if (observation && (observation.period.kind !== (flow ? "FY" : "instant") || observation.period.end.slice(0, 4) !== String(row.fiscalYear) || observation.status === "estimate" || observation.period.end > report.asOf.slice(0, 10))) gate.errors.push(`Annual financial period/status mismatch: ${observationId}`);
      if (observation && observation.metric !== key) gate.errors.push(`Financial metric mismatch: ${observationId}`);
      if (observation && observation.period.end.slice(5) !== report.company.fiscalYearEnd) gate.errors.push(`Financial year-end mismatch: ${observationId}`);
      if (observation && observation.period.start !== (flow ? expectedStart : observation.period.end)) gate.errors.push(`Incomplete annual period: ${observationId}`);
      if (observation && key === "capex" && observation.value !== null && observation.value < 0) gate.errors.push(`CAPEX must be positive outflow: ${observationId}`);
    }
    if (annualRows.some((observation) => observation.basis !== annualRows[0]?.basis || observation.unit !== annualRows[0]?.unit || observation.scope !== annualRows[0]?.scope)) gate.errors.push(`Annual financial unit/basis/scope mismatch: FY${row.fiscalYear}`);
    const accounting = ["assets", "liabilities", "equity"].map((key) => observations.get(row.metrics[key as "assets" | "liabilities" | "equity"]));
    if (accounting.every((observation) => observation?.value !== null && observation?.value !== undefined)) {
      const [assets, liabilities, equity] = accounting;
      if (assets && liabilities && equity && (assets.unit !== liabilities.unit || assets.unit !== equity.unit || assets.basis !== liabilities.basis || assets.basis !== equity.basis || !samePeriod(assets, liabilities) || !samePeriod(assets, equity))) gate.errors.push(`Balance sheet definitions mismatch: FY${row.fiscalYear}`);
      else if (assets?.value !== undefined && assets.value !== null && liabilities?.value !== undefined && liabilities.value !== null && equity?.value !== undefined && equity.value !== null && Math.abs(assets.value - liabilities.value - equity.value) > Math.max(1e-8, Math.abs(assets.value) * 0.0001)) gate.errors.push(`Assets != liabilities + equity: FY${row.fiscalYear}`);
    }
  }
  for (const key of financialKeys) {
    const rows = report.financials.flatMap((row) => { const item = observations.get(row.metrics[key]); return item ? [item] : []; });
    if (rows.some((row) => row.unit !== rows[0]?.unit || row.basis !== rows[0]?.basis || row.scope !== rows[0]?.scope)) gate.errors.push(`Financial comparison definitions mismatch: ${key}`);
  }
  for (const observationId of unique(mandatory)) { const observation = get(observationId, "Required"); if (observation?.value === null && observation.status !== "not-applicable") gate.missingRequiredIds.push(observationId); }
  const price = get(report.priceId, "Price");
  if (price && (price.metric !== "price" || price.unit !== report.company.currency || price.basis !== "market" || price.status === "not-applicable" || (price.value !== null && price.value <= 0))) gate.errors.push("Price definition must match report currency and positive market price");
  for (const observationId of report.summaryIds) get(observationId, "Summary");
  const brokerNames = report.brokers.map((row) => row.name);
  if (unique(brokerNames).length !== brokerNames.length) gate.errors.push("Only latest target per broker is allowed");
  for (const broker of report.brokers) {
    const target = get(broker.targetId, broker.name); checkSources([broker.sourceId], broker.name);
    if (target && (target.metric !== "targetPrice" || target.unit !== report.company.currency || target.basis !== "market" || target.scope !== price?.scope || target.status === "not-applicable")) gate.errors.push(`Broker target definition mismatch: ${broker.name}`);
    if (target && target.value !== null && (!target.sourceIds.includes(broker.sourceId) || target.value <= 0)) gate.errors.push(`Broker target lacks matching positive quote and source: ${broker.name}`);
  }
  if (report.consensusId) {
    const consensus = get(report.consensusId, "Consensus");
    if (consensus?.formula && (consensus.formula.operation !== "mean" || JSON.stringify([...consensus.formula.inputs].sort()) !== JSON.stringify(report.brokers.map((row) => row.targetId).sort()))) gate.errors.push("Consensus must use exactly the displayed broker targets");
  }
  const claims = [...report.profile, ...report.narrative, ...report.indicators, ...report.derivatives, ...report.conclusion, ...report.debates.flatMap((debate) => [...debate.bull, ...debate.bear])];
  for (const claim of claims) {
    checkSources(claim.sourceIds, claim.kind);
    const fullText = `${claim.text} ${claim.caveat ?? ""}`;
    const references = [...fullText.matchAll(tokenPattern)].map((match) => match[1] ?? "");
    for (const observationId of references) get(observationId, claim.kind);
    let remainingText = fullText.replace(tokenPattern, "");
    for (const term of claim.literalTerms) remainingText = remainingText.split(term).join("");
    if (/\d/.test(remainingText)) gate.errors.push(`Narrative number must use observation token: ${claim.text}`);
    if (claim.sourceIds.length === 0 && references.length === 0) gate.errors.push(`Claim lacks evidence: ${claim.text}`);
    if (claim.kind === "interpretation" && !claim.caveat) gate.errors.push(`Interpretation lacks assumptions/counter-evidence: ${claim.text}`);
    if (claim.kind === "external-view" && (!claim.attribution || claim.sourceIds.length === 0)) gate.errors.push(`External view lacks attribution/source: ${claim.text}`);
    if (claim.kind !== "external-view" && tradeAction.test(fullText)) gate.errors.push(`Agent trading recommendation: ${claim.text}`);
  }
  for (const chart of report.charts) {
    if (report.charts.filter((other) => other.id === chart.id).length > 1) gate.errors.push(`Duplicate chart ID: ${chart.id}`);
    const chartRows: Observation[] = [];
    for (const dataset of chart.datasets) {
      if (dataset.observationIds.length !== chart.labels.length) gate.errors.push(`Chart length mismatch: ${chart.id}`);
      for (const observationId of dataset.observationIds) { const observation = get(observationId, chart.id); if (observation) chartRows.push(observation); }
      if (chart.type === "line") for (const [index, observationId] of dataset.observationIds.entries()) {
        if (observations.get(observationId)?.period.end !== chart.labels[index]) gate.errors.push(`Line labels must match observation period end: ${chart.id}`);
      }
    }
    if (chartRows.some((row) => row.unit !== chartRows[0]?.unit || row.scope !== chartRows[0]?.scope || row.basis !== chartRows[0]?.basis)) gate.errors.push(`Chart unit/scope/basis mismatch: ${chart.id}`);
    if (chart.type === "doughnut" && (chart.datasets.length !== 1 || chartRows.some((row) => row.value === null || row.value < 0 || row.unit !== "%" || !samePeriod(row, chartRows[0] as Observation)) || Math.abs(chartRows.reduce((sum, row) => sum + (row.value ?? 0), 0) - 100) > 0.01)) gate.errors.push(`Doughnut requires a complete same-market percentage partition: ${chart.id}`);
  }
  for (const news of report.news) checkSources([news.sourceId], news.title);
  for (const event of report.calendar) checkSources(event.sourceIds, event.title);
  if (report.fixture) gate.warnings.push("가상 fixture: 실제 기업분석에 사용 금지");
  if (gate.missingRequiredIds.length) gate.warnings.push(`필수 데이터 미확보: ${gate.missingRequiredIds.join(", ")}`);
  gate.status = gate.errors.length ? "FAIL" : gate.warnings.length ? "PARTIAL" : "PASS";
  return { report, gate };
}

export function render(report: ResearchReport, gate: Gate, template = readFileSync(templatePath, "utf8")): string {
  const observations = new Map(report.observations.map((observation) => [observation.id, observation]));
  const sources = new Map(report.sources.map((source) => [source.id, source]));
  const citation = (ids: string[]): string => unique(ids).map((sourceId) => {
    const source = sources.get(sourceId); if (!source) throw new Error(`Unknown source: ${sourceId}`);
    return `<a href="${htmlEscape(source.url)}" target="_blank" rel="noopener noreferrer" title="${htmlEscape(source.locator)}">${htmlEscape(source.name)} · ${htmlEscape(source.publishedAt)}</a>`;
  }).join(" · ");
  const value = (observationId: string): string => {
    const observation = observations.get(observationId); if (!observation) throw new Error(`Unknown observation: ${observationId}`);
    return `<span data-observation-id="${htmlEscape(observationId)}">${htmlEscape(format(observation))}</span>`;
  };
  const claims = (items: Claim[]): string => items.length ? `<ul>${items.map((claim) => {
    const text = htmlEscape(claim.text).replace(tokenPattern, (_, observationId: string) => value(observationId));
    const observationSources = [...`${claim.text} ${claim.caveat ?? ""}`.matchAll(tokenPattern)].flatMap((match) => observations.get(match[1] ?? "")?.sourceIds ?? []);
    const caveat = claim.caveat ? htmlEscape(claim.caveat).replace(tokenPattern, (_, observationId: string) => value(observationId)) : "";
    return `<li><strong>[${kinds[claim.kind]}${claim.attribution ? ` · ${htmlEscape(claim.attribution)}` : ""}]</strong> ${text}<br><small>${citation([...claim.sourceIds, ...observationSources])}${caveat ? `<br>조건·반대 증거: ${caveat}` : ""}</small></li>`;
  }).join("")}</ul>` : "<p>확인 자료 없음. 추가 수집 필요.</p>";
  const financials = `<table><tr><th>항목</th>${report.financials.map((row) => `<th>FY ${row.fiscalYear}</th>`).join("")}</tr>${financialKeys.map((key, index) => `<tr><td>${financialLabels[index]}</td>${report.financials.map((row) => {
    const observation = observations.get(row.metrics[key]);
    return `<td>${value(row.metrics[key])}<br><small>${observation ? `${statusLabels[observation.status]} · ${htmlEscape(observation.basis)} · ${htmlEscape(observation.period.start)}~${htmlEscape(observation.period.end)}<br>${citation(observation.sourceIds)}` : ""}</small></td>`;
  }).join("")}</tr>`).join("")}</table>`;
  const annualIds = new Set(report.financials.flatMap((row) => Object.values(row.metrics)));
  const recentRows = report.observations.filter((observation) => !annualIds.has(observation.id) && financialKeys.includes(observation.metric as typeof financialKeys[number]));
  const recentFinancials = recentRows.length ? `<h3>추가 분기·누적·시점 재무</h3><table><tr><th>항목</th><th>값</th><th>기간·기준</th><th>상태·원문</th></tr>${recentRows.map((observation) => `<tr><td>${htmlEscape(observation.label)}</td><td>${value(observation.id)}</td><td>${htmlEscape(observation.period.kind)} · ${htmlEscape(observation.period.start)}~${htmlEscape(observation.period.end)} · ${htmlEscape(observation.basis)}</td><td>${statusLabels[observation.status]}<br>${citation(observation.sourceIds)}</td></tr>`).join("")}</table>` : "<p>추가 분기·누적 재무는 아직 수집되지 않았습니다.</p>";
  const brokerTable = report.brokers.length ? `<table><tr><th>하우스</th><th>외부 투자의견</th><th>목표가</th><th>원문</th></tr>${report.brokers.map((broker) => `<tr><td>${htmlEscape(broker.name)}</td><td>${htmlEscape(broker.opinion)}</td><td>${value(broker.targetId)}</td><td>${citation([broker.sourceId])}</td></tr>`).join("")}</table>` : "<p>하우스별 원문 미확보.</p>";
  const consensus = report.consensusId ? observations.get(report.consensusId) : undefined;
  const validTargets = report.brokers.filter((broker) => observations.get(broker.targetId)?.value !== null).length;
  const consensusHtml = `${brokerTable}${consensus ? `<p>${consensus.formula ? "직접 집계 평균" : "외부 제공 컨센서스"}: ${value(consensus.id)} · 유효 목표가 ${validTargets}개 / 표시 하우스 ${report.brokers.length}개<br>${citation(consensus.sourceIds)}</p>` : "<p>컨센서스 미확보.</p>"}`;
  const chartData = report.charts.map((chart) => ({
    id: chart.id, type: chart.type, title: chart.title,
    data: { labels: chart.labels, datasets: chart.datasets.map((dataset) => ({ label: dataset.label, data: dataset.observationIds.map((observationId) => observations.get(observationId)?.value ?? null), observationIds: dataset.observationIds, borderColor: "#1a3a5c", backgroundColor: chart.type === "doughnut" ? ["#c9a84c", "#1a3a5c", "#64748b", "#94a3b8", "#e5e7eb"] : "rgba(26,58,92,0.15)", spanGaps: false })) },
  }));
  const charts = report.charts.map((chart) => `<div class="chart-wrap"><h3>${htmlEscape(chart.title)}</h3><canvas id="${htmlEscape(chart.id)}"></canvas><table><tr><th>관측</th>${chart.datasets.map((dataset) => `<th>${htmlEscape(dataset.label)}</th>`).join("")}</tr>${chart.labels.map((label, index) => `<tr><td>${htmlEscape(label)}</td>${chart.datasets.map((dataset) => `<td>${value(dataset.observationIds[index] ?? "")}</td>`).join("")}</tr>`).join("")}</table><small>${citation(chart.datasets.flatMap((dataset) => dataset.observationIds.flatMap((observationId) => observations.get(observationId)?.sourceIds ?? [])))}</small></div>`).join("") || "<p>비교 가능한 시계열 미확보. 차트 생략.</p>";
  const sourceList = `<ol>${report.sources.map((source) => `<li id="source-${htmlEscape(source.id)}">${citation([source.id])}<br>${htmlEscape(source.locator)} · ${htmlEscape(source.access)} · 수집 ${htmlEscape(source.collectedAt)}<br>근거: ${htmlEscape(source.excerpt)}${source.originalUrl ? `<br>원출처: <a href="${htmlEscape(source.originalUrl)}">${htmlEscape(source.originalUrl)}</a>` : ""}</li>`).join("")}</ol>`;
  const fields: Record<string, string> = {
    TITLE: htmlEscape(`${report.company.name} (${report.company.ticker})`), COMPANY: htmlEscape(report.company.name),
    AS_OF: htmlEscape(report.asOf), SECTOR: htmlEscape(report.company.sector), STATUS: htmlEscape(gate.status),
    WARNINGS: gate.warnings.map((warning) => `<p>${htmlEscape(warning)}</p>`).join(""),
    PROFILE: claims(report.profile), SUMMARY: report.summaryIds.map((observationId) => {
      const observation = observations.get(observationId);
      return `<div class="metric"><div class="label">${htmlEscape(observation?.label ?? "")}</div><div class="value">${value(observationId)}</div><div class="change">${observation ? citation(observation.sourceIds) : ""}</div></div>`;
    }).join(""), FINANCIALS: financials + recentFinancials, CONSENSUS: consensusHtml, CHARTS: charts,
    INDICATORS: claims(report.indicators), DERIVATIVES: claims(report.derivatives), NARRATIVE: claims(report.narrative),
    NEWS: report.news.map((news) => `<p>${htmlEscape(news.title)}<br>${citation([news.sourceId])}</p>`).join("") || "<p>새로운 중요 자료 미확보.</p>",
    DEBATES: report.debates.map((debate) => `<h3>${htmlEscape(debate.title)}</h3><div class="bull-block"><strong>Bull</strong>${claims(debate.bull)}</div><div class="bear-block"><strong>Bear</strong>${claims(debate.bear)}</div>`).join("") || "<p>원문으로 대조 가능한 쟁점 미확보.</p>",
    CALENDAR: `<table><tr><th>일자</th><th>일정</th><th>확인 상태</th><th>원문</th></tr>${report.calendar.map((event) => `<tr><td>${htmlEscape(event.date)}</td><td>${htmlEscape(event.title)}</td><td>${event.status === "confirmed" ? "확정" : "미확정"}</td><td>${citation(event.sourceIds)}</td></tr>`).join("")}</table>`,
    CONCLUSION: claims(report.conclusion), SOURCES: sourceList,
    CHART_DATA_JSON: JSON.stringify(chartData).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"),
  };
  const output = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
    const content = fields[key]; if (content === undefined) throw new Error(`Unsupported template token: ${key}`); return content;
  });
  if (/\{\{/.test(output)) throw new Error("Unresolved template token");
  return output;
}

export function inspectHtml(html: string): string[] {
  const errors: string[] = [];
  for (const tag of ["html", "body", "main", "style"]) {
    if ([...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].length !== 1 || [...html.matchAll(new RegExp(`</${tag}\\s*>`, "gi"))].length !== 1) errors.push(`Expected one ${tag} opening/closing tag`);
  }
  const document = parse(html, { onParseError: (error) => errors.push(`HTML ${error.code}`) });
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1] ?? "")) continue;
    try {
      if (/type="application\/json"/.test(match[1] ?? "")) JSON.parse(match[2] ?? "");
      else new Script(match[2] ?? "");
    } catch (error: unknown) { errors.push(`Script/JSON: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const ids: string[] = [];
  function visit(node: DefaultTreeAdapterMap["node"]): void {
    if ("attrs" in node) for (const attribute of node.attrs) if (attribute.name === "id") ids.push(attribute.value);
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  }
  visit(document);
  if (unique(ids).length !== ids.length) errors.push("Duplicate HTML ID");
  return errors;
}

export function build(input: unknown): { html: string | null; gate: Gate } {
  const { report, gate } = prepare(input);
  if (!report || gate.status === "FAIL") return { html: null, gate };
  try {
    const html = render(report, gate);
    gate.errors.push(...inspectHtml(html));
    gate.outputSha256 = hash(html);
    if (gate.errors.length) { gate.status = "FAIL"; return { html: null, gate }; }
    return { html, gate };
  } catch (error: unknown) {
    gate.errors.push(error instanceof Error ? error.message : String(error)); gate.status = "FAIL";
    return { html: null, gate };
  }
}

export function verify(input: unknown, html: string): Gate {
  const result = build(input);
  result.gate.errors.push(...inspectHtml(html));
  if (result.html !== html) result.gate.errors.push("Rendered output differs from canonical input/template; rebuild required");
  if (result.gate.errors.length) result.gate.status = "FAIL";
  result.gate.outputSha256 = hash(html);
  return result.gate;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!["build", "verify"].includes(command ?? "") || !inputPath || !outputPath || resolve(inputPath) === resolve(outputPath) || resolve(inputPath) === `${resolve(outputPath)}.gate.json`) {
    console.error("Usage: tsx docs/scripts/report.ts build|verify input.json output.html"); process.exitCode = 1;
  } else {
    const target = resolve(outputPath); const gatePath = `${target}.gate.json`;
    mkdirSync(dirname(target), { recursive: true });
    let gate: Gate;
    try {
      const input: unknown = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
      if (command === "build") {
        const result = build(input); gate = result.gate;
        if (result.html !== null) writeFileSync(target, result.html, "utf8");
      } else gate = verify(input, readFileSync(target, "utf8"));
    } catch (error: unknown) {
      gate = { status: "FAIL", errors: [error instanceof Error ? error.message : String(error)], warnings: [], missingRequiredIds: [], inputSha256: "", outputSha256: null, verificationScope: "입력/출력 파일 읽기 실패" };
    }
    writeFileSync(gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ status: gate.status, errors: gate.errors, warnings: gate.warnings, gatePath }, null, 2));
    if (gate.status === "FAIL") process.exitCode = 1;
  }
}
