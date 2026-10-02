import { z } from "zod";

export const KnowledgeInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  source: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
});
