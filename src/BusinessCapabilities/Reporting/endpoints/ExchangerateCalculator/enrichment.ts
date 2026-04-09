export interface ExchangerateCalculatorEnrichmentInput {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly session: string;
}

export interface ExchangerateCalculatorEnrichmentOutput extends ExchangerateCalculatorEnrichmentInput {
  readonly baseCurrencyAmount: number;
  readonly exchangeRate: number;
  readonly reportDate: Date;
}

export async function enrich(input: ExchangerateCalculatorEnrichmentInput): Promise<ExchangerateCalculatorEnrichmentOutput> {
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
  const baseCurrencyAmount = Math.round(input.amount * rate * 100) / 100;

  return {
    ...input,
    exchangeRate: rate,
    baseCurrencyAmount,
    reportDate: new Date(),
  };
}
