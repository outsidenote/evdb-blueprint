import { z } from "zod";

export const CreateAccountSchema = z.object({
  currency: z.string().min(1),
  name: z.string().min(1),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
