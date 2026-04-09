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
  if (input.currency === "EUR") {
    return {
      ...input,
      exchangeRate: 1,
      baseCurrencyAmount: input.amount,
      reportDate: new Date(),
    };
  }

  const res = await fetch(`https://api.frankfurter.app/latest?from=${input.currency}&to=EUR`);
  const data = await res.json() as { rates: { EUR: number } };
  const rate = data.rates.EUR;

  return {
    ...input,
    exchangeRate: rate,
    baseCurrencyAmount: Math.round(input.amount * rate * 100) / 100,
    reportDate: new Date(),
  };
}
