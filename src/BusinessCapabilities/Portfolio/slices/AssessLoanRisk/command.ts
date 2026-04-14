import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface AssessLoanRisk extends ICommand {
  readonly commandType: "AssessLoanRisk";
  readonly portfolioId: string;
  readonly acquisitionDate: Date;
  readonly borrowerName: string;
  readonly creditRating: string;
  readonly expectedLoss: number;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
  readonly probabilityOfDefault: number;
  readonly capitalRequirement: number;
  readonly riskBand: string;
  readonly expectedPortfolioLoss: number;
  readonly riskNarrative: string;
  readonly simulatedDefaultRate: number;
  readonly tailRiskLoss: number;
  readonly worstCaseLoss: number;
}
