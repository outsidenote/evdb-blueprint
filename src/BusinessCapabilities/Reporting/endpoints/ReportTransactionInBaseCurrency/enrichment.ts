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

  // If currency is already EUR, no conversion needed
  if (input.currency === "EUR") {
    return {
      ...input,
      baseCurrencyAmount: input.amount,
      exchangeRate: 1,
      reportDate,
    };
  }

  // Fetch exchange rate from Frankfurter API
  const response = await fetch(`https://api.frankfurter.app/latest?from=${input.currency}&to=EUR`);
  const data = await response.json() as { rates: { EUR: number } };

  const exchangeRate = data.rates.EUR;
  const baseCurrencyAmount = Math.round(input.amount * exchangeRate * 100) / 100;

  return {
    ...input,
    baseCurrencyAmount,
    exchangeRate,
    reportDate,
  };
}
