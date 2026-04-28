import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { AssessLoanRisk } from "./command.js";
import type { PortfolioStreamType } from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.js";

/**
 * Pure command handler for the AssessLoanRisk command.
 * ONLY appends events — no I/O, no fetching, no returning values.
 */
export const handleAssessLoanRisk: CommandHandler<
  PortfolioStreamType,
  AssessLoanRisk
> = (stream, command) => {
  stream.appendEventLoanRiskAssessed({
    acquisitionDate: command.acquisitionDate,
    borrowerName: command.borrowerName,
    capitalRequirement: command.capitalRequirement,
    creditRating: command.creditRating,
    expectedLoss: command.expectedLoss,
    expectedPortfolioLoss: command.expectedPortfolioLoss,
    interestRate: command.interestRate,
    loanAmount: command.loanAmount,
    loanId: command.loanId,
    maturityDate: command.maturityDate,
    portfolioId: command.portfolioId,
    probabilityOfDefault: command.probabilityOfDefault,
    riskBand: command.riskBand,
    riskNarrative: command.riskNarrative,
    simulatedDefaultRate: command.simulatedDefaultRate,
    tailRiskLoss: command.tailRiskLoss,
    worstCaseLoss: command.worstCaseLoss,
  });
};
