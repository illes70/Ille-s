import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { claudeImageBlock } from "../creative/claude-files";

export type Tool = Anthropic.Beta.Messages.BetaTool;
export type ToolResultContent = Exclude<Anthropic.Beta.Messages.BetaToolResultBlockParam["content"], string | undefined>;

/** A tool result that carries images (e.g. a composed ad) so the assistant can look at it. */
export class Rich {
  constructor(readonly blocks: ToolResultContent) {}
}

export async function withImage(text: unknown, url: string) {
  return new Rich([{ type: "text", text: JSON.stringify(text) }, await claudeImageBlock(url)] as ToolResultContent);
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  schema: S;
  definition: Tool;
  /** short Hungarian label shown in the chat while the tool runs */
  label: (input: z.infer<S>) => string;
  run: (input: z.infer<S>) => Promise<unknown>;
}

export function tool<S extends z.ZodType>(name: string, description: string, schema: S, label: ToolDef<S>["label"], run: ToolDef<S>["run"]): ToolDef {
  const input_schema = z.toJSONSchema(schema) as Tool["input_schema"];
  delete (input_schema as Record<string, unknown>)["$schema"];
  return {
    schema,
    label,
    run,
    definition: { name, description, input_schema, eager_input_streaming: true },
  } as unknown as ToolDef;
}

/** Every risky write tool takes this flag; see meta/advisor.ts → gate(). */
export const confirmedFlag = z
  .boolean()
  .default(false)
  .describe("Csak akkor true, ha egy korábbi hívás needs_confirmation választ adott, elmondtad az aggályt, és a felhasználó kifejezetten megerősítette.");

export const CTA = z
  .enum(["LEARN_MORE", "SIGN_UP", "GET_QUOTE", "CONTACT_US", "APPLY_NOW", "BOOK_NOW", "CALL_NOW", "SUBSCRIBE", "GET_OFFER", "ORDER_NOW", "SHOP_NOW", "SEND_MESSAGE", "WHATSAPP_MESSAGE", "DOWNLOAD"])
  .describe("Meta call-to-action gomb");
