import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/);
const text = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const publication = z.union([timestamp, z.iso.date()]);
const source = z.strictObject({
  id, name: text, url: z.httpUrl(), publishedAt: publication.nullable(), collectedAt: timestamp,
  locator: text, excerpt: text, access: z.enum(["direct", "secondary"]),
  originalUrl: z.httpUrl().optional(),
});
const period = z.strictObject({
  kind: z.enum(["FY", "quarter", "YTD", "instant"]), start: z.iso.date(), end: z.iso.date(),
});
const observation = z.strictObject({
  id, label: text, value: z.number().finite().refine((value) => Math.abs(value) <= Number.MAX_SAFE_INTEGER, "Rescale unit to preserve numeric precision").nullable(), unit: text, metric: text, scope: text,
  observedAt: timestamp, period, basis: z.enum(["consolidated", "separate", "market"]),
  status: z.enum(["actual", "preliminary", "estimate", "missing", "not-applicable"]),
  sourceIds: z.array(id), reason: text.optional(),
  formula: z.strictObject({ operation: z.enum(["mean", "sum", "difference", "upside", "ratio-percent"]), inputs: z.array(id).min(1) }).optional(),
});
const claim = z.strictObject({
  kind: z.enum(["fact", "external-view", "interpretation"]), text,
  sourceIds: z.array(id), attribution: text.optional(), caveat: text.optional(),
  literalTerms: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9-]*\d[A-Za-z0-9-]*$/)).default([]),
});
const metrics = z.strictObject({
  revenue: id, operatingProfit: id, netIncome: id,
  assets: id, liabilities: id, equity: id, cash: id, debt: id, cfo: id, capex: id,
});
const chart = z.strictObject({
  id, title: text, type: z.enum(["line", "bar", "doughnut"]),
  labels: z.array(text).min(1),
  datasets: z.array(z.strictObject({ label: text, observationIds: z.array(id).min(1) })).min(1),
});
export const reportSchema = z.strictObject({
  schemaVersion: z.literal("3.1"), asOf: timestamp, fixture: z.boolean().default(false),
  company: z.strictObject({ name: text, ticker: text, market: text, currency: text, sector: text, fiscalYearEnd: z.string().regex(/^\d{2}-\d{2}$/).refine((value) => z.iso.date().safeParse(`2000-${value}`).success, "Invalid fiscal year end") }),
  sources: z.array(source).min(1), observations: z.array(observation).min(1),
  priceId: id, summaryIds: z.array(id).min(1),
  financials: z.array(z.strictObject({ fiscalYear: z.number().int().min(1000).max(9999), metrics })).length(3),
  brokers: z.array(z.strictObject({ name: text, targetId: id, opinion: text, sourceId: id })),
  consensusId: id.nullable(), charts: z.array(chart),
  profile: z.array(claim).min(1), narrative: z.array(claim), indicators: z.array(claim), derivatives: z.array(claim),
  debates: z.array(z.strictObject({ title: text, bull: z.array(claim), bear: z.array(claim) })),
  news: z.array(z.strictObject({ title: text, sourceId: id })),
  calendar: z.array(z.strictObject({ date: z.iso.date(), title: text, status: z.enum(["confirmed", "tentative"]), sourceIds: z.array(id).min(1) })),
  conclusion: z.array(claim).min(1),
});

export type ResearchReport = z.infer<typeof reportSchema>;
export type Observation = ResearchReport["observations"][number];
export type Claim = ResearchReport["conclusion"][number];
export type Chart = ResearchReport["charts"][number];
export type Gate = {
  status: "PASS" | "PARTIAL" | "FAIL";
  errors: string[]; warnings: string[]; missingRequiredIds: string[];
  inputSha256: string; outputSha256: string | null;
  verificationScope: string;
};
