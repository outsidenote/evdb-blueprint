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
  const reportDate = new Date();

  if (input.currency === "EUR") {
    return {
      ...input,
      exchangeRate: 1,
      baseCurrencyAmount: input.amount,
      reportDate,
    };
  }

  const response = await fetch(`https://api.frankfurter.app/latest?from=${input.currency}&to=EUR`);
  const data = await response.json() as { rates: { EUR: number } };
  const exchangeRate = data.rates.EUR;
  const baseCurrencyAmount = Math.round(input.amount * exchangeRate * 100) / 100;

  return {
    ...input,
    exchangeRate,
    baseCurrencyAmount,
    reportDate,
  };
}
