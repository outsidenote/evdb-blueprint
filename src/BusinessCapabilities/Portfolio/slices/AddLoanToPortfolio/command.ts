import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface AddLoanToPortfolio extends ICommand {
  readonly commandType: "AddLoanToPortfolio";
  readonly portfolioId: string;
  readonly acquisitionDate: Date;
  readonly borrowerName: string;
  readonly creditRating: string;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
}
