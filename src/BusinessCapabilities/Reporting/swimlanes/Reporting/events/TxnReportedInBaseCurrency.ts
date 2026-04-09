export interface ITxnReportedInBaseCurrency {
  readonly amount: number;
  readonly currency: string;
  readonly session: string;
  readonly baseCurrencyAmount: number;
  readonly exchangeRate: number;
  readonly account: string;
  readonly reportDate: Date;
}
