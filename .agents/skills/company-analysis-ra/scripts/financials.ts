import type { Observation, ResearchReport } from "./schema.js";

type Statement = "income" | "balance" | "cashflow";
type Row = { metric: string; label: string; style?: "detail" | "total" | "ratio" };
type Column = { label: string; period: Observation["period"]; rows: Observation[] };
type Context = { scope: string; basis: Observation["basis"]; unit: string };
type Helpers = { escape: (text: string) => string; citation: (ids: string[]) => string };
const definitions: Record<Statement, { title: string; rows: Row[] }> = {
  income: { title: "손익계산서", rows: [
    { metric: "revenue", label: "매출액", style: "total" },
    { metric: "revenueGrowth", label: "매출 증감률 (%)", style: "ratio" },
    { metric: "costOfSales", label: "매출원가", style: "detail" },
    { metric: "grossProfit", label: "매출총이익" },
    { metric: "sga", label: "판매비와관리비", style: "detail" },
    { metric: "operatingProfit", label: "영업이익", style: "total" },
    { metric: "operatingMargin", label: "영업이익률 (%)", style: "ratio" },
    { metric: "operatingProfitGrowth", label: "영업이익 증감률 (%)", style: "ratio" },
    { metric: "financeIncome", label: "금융수익", style: "detail" },
    { metric: "financeCosts", label: "금융비용", style: "detail" },
    { metric: "otherIncome", label: "기타영업외수익", style: "detail" },
    { metric: "otherExpense", label: "기타영업외비용", style: "detail" },
    { metric: "associateProfit", label: "관계·공동기업 지분법손익", style: "detail" },
    { metric: "profitBeforeTax", label: "법인세비용차감전순이익" },
    { metric: "incomeTax", label: "법인세비용", style: "detail" },
    { metric: "netIncome", label: "당기순이익", style: "total" },
    { metric: "netIncomeParent", label: "지배기업 소유주 귀속", style: "detail" },
    { metric: "netMargin", label: "순이익률 (%)", style: "ratio" },
  ] },
  balance: { title: "재무상태표", rows: [
    { metric: "currentAssets", label: "유동자산" },
    { metric: "cash", label: "현금 및 현금성자산", style: "detail" },
    { metric: "liquidityBroad", label: "현금성자산 (단기금융상품 등 포함)", style: "detail" },
    { metric: "receivables", label: "매출채권", style: "detail" },
    { metric: "inventory", label: "재고자산", style: "detail" },
    { metric: "payables", label: "매입채무", style: "detail" },
    { metric: "nonCurrentAssets", label: "비유동자산" },
    { metric: "ppe", label: "유형자산", style: "detail" },
    { metric: "assets", label: "자산총계", style: "total" },
    { metric: "currentLiabilities", label: "유동부채" },
    { metric: "nonCurrentLiabilities", label: "비유동부채" },
    { metric: "liabilities", label: "부채총계", style: "total" },
    { metric: "equity", label: "자본총계", style: "total" },
    { metric: "debt", label: "이자부 차입금" },
    { metric: "netDebt", label: "순차입금 (현금 및 현금성자산 차감)" },
    { metric: "netCashBroad", label: "순현금 (단기금융상품 등 포함)" },
  ] },
  cashflow: { title: "현금흐름표", rows: [
    { metric: "netIncome", label: "당기순이익" },
    { metric: "cashFlowAdjustments", label: "비현금 등 조정", style: "detail" },
    { metric: "workingCapitalFlow", label: "영업자산·부채 변동", style: "detail" },
    { metric: "cfo", label: "영업활동 현금흐름", style: "total" },
    { metric: "cfi", label: "투자활동 현금흐름", style: "total" },
    { metric: "ppeCapex", label: "유형자산 현금취득 (유출액)", style: "detail" },
    { metric: "intangibleOutflow", label: "무형자산 현금취득 (원문 부호)", style: "detail" },
    { metric: "cff", label: "재무활동 현금흐름", style: "total" },
    { metric: "dividendsPaid", label: "배당금 지급 (원문 부호)", style: "detail" },
    { metric: "fxCashEffect", label: "현금 환율변동 효과", style: "detail" },
    { metric: "cashReclassification", label: "매각예정자산 재분류", style: "detail" },
    { metric: "cashChange", label: "현금 및 현금성자산 증감" },
    { metric: "capex", label: "CAPEX (양수 투자지출)" },
    { metric: "fcf", label: "잉여현금흐름 (FCF)", style: "total" },
  ] },
};
const samePeriod = (a: Observation["period"], b: Observation["period"]): boolean => a.kind === b.kind && a.start === b.start && a.end === b.end;
const basisLabel = { consolidated: "연결", separate: "별도", market: "시장" };
const statusLabel = { actual: "확정", preliminary: "잠정 P", estimate: "전망 E", missing: "미확보", "not-applicable": "미적용" };

// Presentation conversions never replace observations or chart payload values.
export function financialDisplay(unit: string): { unit: string; divisor: number } {
  if (unit === "백만원") return { unit: "억원", divisor: 100 };
  if (unit === "천원") return { unit: "억원", divisor: 100000 };
  if (unit === "KRW" || unit === "원") return { unit: "억원", divisor: 100000000 };
  return { unit, divisor: 1 };
}
export function renderFinancials(report: ResearchReport, helpers: Helpers): string {
  const { escape, citation } = helpers;
  const tableDefinitions = structuredClone(definitions);
  const customized = new Set<string>();
  for (const custom of report.financialRows ?? []) {
    const key = `${custom.statement}.${custom.metric}`;
    if (customized.has(key)) throw new Error(`Duplicate financial row: ${key}`);
    customized.add(key);
    const rows = tableDefinitions[custom.statement].rows;
    const existing = rows.findIndex((row) => row.metric === custom.metric);
    const row: Row = { metric: custom.metric, label: custom.label, ...(custom.style ? { style: custom.style } : {}) };
    if (existing >= 0) rows[existing] = row;
    else if (custom.afterMetric) { const anchor = rows.findIndex((row) => row.metric === custom.afterMetric); if (anchor < 0) throw new Error(`Unknown financial row anchor: ${custom.afterMetric}`); rows.splice(anchor + 1, 0, row); }
    else rows.push(row);
  }
  const stocks = new Set(tableDefinitions.balance.rows.map((row) => row.metric));
  const flows = new Set([...tableDefinitions.income.rows, ...tableDefinitions.cashflow.rows].map((row) => row.metric));
  for (const row of report.observations.filter((row) => row.basis !== "market")) {
    if (stocks.has(row.metric) && row.period.kind !== "instant") throw new Error(`Financial stock requires instant period: ${row.id}`);
    if (flows.has(row.metric) && row.period.kind === "instant") throw new Error(`Financial flow requires FY, quarter or YTD period: ${row.id}`);
  }
  const observations = new Map(report.observations.map((row) => [row.id, row]));
  const find = (column: Column, metric: string): Observation | undefined => {
    const rows = column.rows.filter((row) => row.metric === metric);
    if (rows.length > 1) throw new Error(`Ambiguous financial cell: ${metric} / ${column.label}. Select one observation per period, scope and basis.`);
    return rows[0];
  };
  const cell = (row: Observation | undefined, unit: string): string => {
    if (!row) return '<td class="num missing"><span title="해당 기간 자료 미확보">—</span></td>';
    const marker = row.status === "preliminary" ? "P" : row.status === "estimate" ? "E" : "";
    if (row.value === null) return `<td class="num missing"><span data-observation-id="${escape(row.id)}" title="${escape(row.reason ?? "자료 미확보")}">${row.status === "not-applicable" ? "N/A" : "—"}</span></td>`;
    if (row.unit !== unit && row.unit !== "%") throw new Error(`Financial display unit mismatch: ${row.id}`);
    const displayed = row.value / (row.unit === "%" ? 1 : financialDisplay(unit).divisor);
    const precision = row.unit === "%" || financialDisplay(unit).divisor !== 1 ? 1 : 4;
    const formatted = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: precision, minimumFractionDigits: row.unit === "%" ? 1 : 0 }).format(Math.abs(displayed));
    const text = displayed !== 0 && Number(formatted.replace(/,/g, "")) === 0 ? Math.abs(displayed).toExponential(2) : formatted;
    return `<td class="num${row.status === "preliminary" ? " preliminary" : row.status === "estimate" ? " estimate" : ""}"><span data-observation-id="${escape(row.id)}" data-raw-value="${row.value}" title="${escape(`${row.label}: ${row.value} ${row.unit} · ${statusLabel[row.status]}`)}">${displayed < 0 ? `(${text})` : text}</span>${marker ? `<sup class="value-status">${marker}</sup>` : ""}</td>`;
  };
  const table = (statement: Statement, columns: Column[], context: Context, suffix: string, required: boolean): string => {
    const definition = tableDefinitions[statement];
    if (!required) columns = columns.filter((column) => definition.rows.some((row) => !["netIncome", "operatingMargin", "netMargin"].includes(row.metric) && find(column, row.metric)));
    if (!columns.length) return "";
    const rows = definition.rows.filter((row) => columns.some((column) => find(column, row.metric)));
    if (!rows.some((row) => !["netIncome", "operatingMargin", "netMargin"].includes(row.metric)) && !required) return "";
    const used = columns.flatMap((column) => rows.flatMap((row) => { const observation = find(column, row.metric); return observation ? [observation] : []; }));
    const hasAmounts = used.some((row) => row.unit !== "%"); const hasPercent = used.some((row) => row.unit === "%");
    const displayUnit = `${hasAmounts ? financialDisplay(context.unit).unit : ""}${hasPercent ? hasAmounts ? ", %" : "%" : ""}`;
    const notes = [
      "금액은 표시 단위로 환산·반올림했습니다. 괄호는 음수, —는 미확보, P는 잠정, E는 전망입니다. 원래 값·단위는 숫자에 마우스를 올려 확인할 수 있습니다.",
      ...(rows.some((row) => row.metric === "capex") ? ["CAPEX는 양수 투자지출이며 FCF는 영업활동 현금흐름−CAPEX입니다. 현금취득 범위·리스·기업결합 포함 여부는 본문과 원문 정의를 확인하십시오."] : []),
      ...(rows.some((row) => row.metric === "netDebt") ? ["순차입금은 이자부 차입금−현금 및 현금성자산입니다. 차입금 범위는 원문을 따르며 단기금융상품 등을 포함한 넓은 현금성자산과 구분합니다."] : []),
    ];
    const tableId = `statement-${statement}-${suffix}`;
    return `<article class="statement" data-statement="${statement}"><div class="table-heading"><h3 id="${escape(tableId)}">${definition.title} <span>${escape((suffix.startsWith("annual") || suffix.startsWith("FY")) ? "연간" : suffix.startsWith("quarter") ? "분기" : suffix.startsWith("YTD") ? "누적" : "기말")}</span></h3><span class="table-unit">${basisLabel[context.basis]} · 단위: ${escape(displayUnit)}</span></div><div class="table-scroll" tabindex="0" role="region" aria-labelledby="${escape(tableId)}"><table class="financial-table"><thead><tr><th scope="col">계정과목</th>${columns.map((column) => `<th scope="col" class="num">${escape(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr class="${row.style ?? "regular"}"><th scope="row">${escape(row.label)}</th>${columns.map((column) => cell(find(column, row.metric), context.unit)).join("")}</tr>`).join("")}</tbody></table></div><div class="table-notes"><p class="table-context">범위: ${escape(context.scope)}</p>${columns.map((column) => { const items = used.filter((row) => column.rows.includes(row)); return `<p><strong>${escape(column.label)}</strong> · ${[...new Set(items.map((row) => statusLabel[row.status]))].join(" / ")} · ${citation(items.flatMap((row) => row.sourceIds))}</p>`; }).join("")}<details><summary>단위·계정 정의</summary>${notes.map((note) => `<p>${escape(note)}</p>`).join("")}</details></div></article>`;
  };
  const years = [...report.financials].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const anchor = observations.get(years[0]!.metrics.revenue)!;
  const context: Context = { scope: anchor.scope, basis: anchor.basis, unit: anchor.unit };
  const annual = (statement: Statement): Column[] => years.map((year) => {
    const metric = statement === "balance" ? "assets" : "revenue";
    const period = observations.get(year.metrics[metric])!.period;
    return { label: statement === "balance" ? period.end : String(year.fiscalYear), period, rows: report.observations.filter((row) => samePeriod(row.period, period) && row.scope === context.scope && row.basis === context.basis) };
  });
  const annualIds = new Set(years.flatMap((year) => Object.values(year.metrics)));
  const recent = report.observations.filter((row) => !annualIds.has(row.id) && row.basis !== "market" && row.period.end > observations.get(years.at(-1)!.metrics.revenue)!.period.end && Object.values(tableDefinitions).some((definition) => definition.rows.some((definitionRow) => definitionRow.metric === row.metric)));
  const groups = new Map<string, { context: Context; columns: Column[]; kind: Observation["period"]["kind"] }>();
  for (const row of recent) {
    const monetaryUnit = row.unit === "%" ? recent.find((other) => other.unit !== "%" && other.scope === row.scope && other.basis === row.basis && samePeriod(other.period, row.period))?.unit ?? context.unit : row.unit;
    if (!monetaryUnit) continue;
    const key = JSON.stringify([row.scope, row.basis, row.period.kind, monetaryUnit]);
    let group = groups.get(key);
    if (!group) { group = { context: { scope: row.scope, basis: row.basis, unit: monetaryUnit }, kind: row.period.kind, columns: [] }; groups.set(key, group); }
    let column = group.columns.find((column) => samePeriod(column.period, row.period));
    if (!column) { const range = row.period.start.slice(0, 4) === row.period.end.slice(0, 4) ? `${row.period.start.slice(0, 7).replace("-", ".")}~${row.period.end.slice(5, 7)}` : `${row.period.start}~${row.period.end}`; column = { label: row.period.kind === "instant" ? row.period.end : `${range}${row.period.kind === "YTD" ? " 누적" : ""}`, period: row.period, rows: [] }; group.columns.push(column); }
    column.rows.push(row);
  }
  const recentTables = [...groups.values()].map((group, index) => {
    group.columns.sort((a, b) => a.period.start.localeCompare(b.period.start) || a.period.end.localeCompare(b.period.end));
    const statements: Statement[] = group.kind === "instant" ? ["balance"] : ["income", "cashflow"];
    return statements.map((statement) => table(statement, group.columns, group.context, `${group.kind}-${index}`, false)).join("");
  }).join("");
  return `<div class="financial-statements">${(["income", "balance", "cashflow"] as const).map((statement) => table(statement, annual(statement), context, "annual", true)).join("")}</div>${recentTables ? `<div class="subsection-heading"><h3>최근 분기·누적 실적</h3><p>단일 분기, 누적 흐름, 기말 잔액을 별도 표로 비교합니다. 사업부별 수치는 범위를 구분합니다.</p></div>${recentTables}` : '<p class="empty-state">추가 분기·누적 자료 미확보.</p>'}`;
}
