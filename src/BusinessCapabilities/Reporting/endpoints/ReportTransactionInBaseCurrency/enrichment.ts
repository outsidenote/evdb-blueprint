export interface ReportTransactionInBaseCurrencyEnrichmentInput {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly session: string;
}

export interface ReportTransactionInBaseCurrencyEnrichmentOutput extends ReportTransactionInBaseCurrencyEnrichmentInput {
  readonly baseCurrencyAmount: number;
  readonly exchangeRate: number;
  readonly reportDate: Date;
}

export async function enrich(input: ReportTransactionInBaseCurrencyEnrichmentInput): Promise<ReportTransactionInBaseCurrencyEnrichmentOutput> {
  // TODO: implement enrichment logic — see TODO_CONTEXT.md for backendPrompts instructions
  return {
    ...input,
    baseCurrencyAmount: 0, // TODO: compute enriched field
    exchangeRate: 0, // TODO: compute enriched field
    reportDate: new Date(), // TODO: compute enriched field
  };
}
