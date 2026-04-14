import { z } from "zod";

export const AddLoanToPortfolioSchema = z.object({
  portfolioId: z.string().min(1),
  borrowerName: z.string().min(1),
  creditRating: z.string().min(1),
  interestRate: z.number(),
  loanAmount: z.number(),
  maturityDate: z.coerce.date(),
});

export type AddLoanToPortfolioInput = z.infer<typeof AddLoanToPortfolioSchema>;
