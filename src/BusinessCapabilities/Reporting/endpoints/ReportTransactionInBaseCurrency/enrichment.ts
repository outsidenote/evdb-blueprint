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
      baseCurrencyAmount: input.amount,
      exchangeRate: 1,
      reportDate: new Date(),
    };
  }

  const res = await fetch(`https://api.frankfurter.app/latest?from=${input.currency}&to=EUR`);
  const data = await res.json() as { rates: { EUR: number } };
  const exchangeRate = data.rates.EUR;
  const baseCurrencyAmount = Math.round(input.amount * exchangeRate * 100) / 100;

  return {
    ...input,
    baseCurrencyAmount,
    exchangeRate,
    reportDate: new Date(),
  };
}
