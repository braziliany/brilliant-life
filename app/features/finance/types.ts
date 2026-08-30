export type FinanceTransactionType = "expense" | "income" | "refund" | "transfer" | "repayment";

export const LIFE_DOMAINS = ["family", "food", "digital", "device", "entertainment", "daily_life", "transport", "appearance", "health", "learning", "other"] as const;

export type LifeDomain = typeof LIFE_DOMAINS[number];

export function isLifeDomain(value: unknown): value is LifeDomain {
  return typeof value === "string" && LIFE_DOMAINS.some((domain) => domain === value);
}

export type NormalizedFinanceTransaction = {
  source: string;
  sourceId: string;
  occurredAt: string;
  type: FinanceTransactionType;
  amountCents: number;
  currency: string;
  rawType: string;
  rawCategory: string;
  rawSubcategory: string;
  accountFrom: string;
  accountTo: string;
  note: string;
  tags: string[];
  lifeDomain: LifeDomain;
};

export type FinanceImportReport = {
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type FinanceTransactionRecord = NormalizedFinanceTransaction & {
  id: number;
  lifeDomainOverride: LifeDomain | null;
  personId: number | null;
  projectId: number | null;
  assetId: number | null;
  eventId: number | null;
  placeId: number | null;
  semanticNote: string;
};

export type FinanceTransactionAuditView = {
  id: number;
  key: string;
  source: string;
  sourceId: string;
  occurredAt: string;
  type: FinanceTransactionType;
  amountCents: number;
  currency: string;
  title: string;
  rawType: string;
  rawCategory: string;
  rawSubcategory: string;
  lifeDomain: LifeDomain;
  lifeDomainOverride: LifeDomain | null;
  effectiveLifeDomain: LifeDomain;
  semanticNote: string;
};

export interface FinanceSourceAdapter<TInput = unknown> {
  readonly source: string;
  parse(input: TInput): Promise<NormalizedFinanceTransaction[]>;
}
