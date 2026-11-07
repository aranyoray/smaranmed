"use node";

import { createOpenAI } from "@ai-sdk/openai";
import { Agent, createTool } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { stepCountIs, type LanguageModel } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import { action } from "./_generated/server";

const CLINICAL = /hba1c|insulin|mg\/dl|mmol|diagnos|prescri|\b\d+(?:\.\d+)?\s*%/i;

const INSTRUCTIONS = `You draft a follow-up reminder for Barasat Diabetes & Diagnostics.
Call getPatient and searchPolicy before you write.
Reply with JSON only: {"en":"...","bn":"..."}.
Use the first name and the last visit date.
Do not give medical advice, mention lab values, or recommend treatment.`;

const getPatient = createTool({
  description: "Scheduling facts for one patient. Does not include lab values.",
  inputSchema: z.object({ patientId: z.string() }),
  execute: async (ctx, { patientId }) => {
    const row = await ctx.runQuery(internal.patients.getScheduling, { patientId });
    if (!row) return { error: "Unknown patient" };
    return {
      name: row.name,
      lang: row.lang,
      lastVisit: row.lastVisit,
      nextRecall: row.nextRecall,
      status: row.status,
      hasPhone: row.hasPhone,
    };
  },
});

const searchPolicy = createTool({
  description: "Clinic rules for follow-up reminders.",
  inputSchema: z.object({ query: z.string() }),
  execute: async (ctx, { query }) => {
    return await ctx.runAction(internal.embed.searchPolicy, { query });
  },
});

function makeAgent(languageModel: LanguageModel) {
  return new Agent(components.agent, {
    name: "Outreach drafter",
    languageModel,
    instructions: INSTRUCTIONS,
    tools: { getPatient, searchPolicy },
    stopWhen: stepCountIs(6),
  });
}

function parseDraft(text: string): { en: string; bn: string } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[0]) as { en?: unknown; bn?: unknown };
    if (typeof value.en !== "string" || typeof value.bn !== "string") return null;
    const en = value.en.trim();
    const bn = value.bn.trim();
    if (!en || !bn) return null;
    return { en, bn };
  } catch {
    return null;
  }
}

function rejected(en: string, bn: string) {
  return CLINICAL.test(en) || CLINICAL.test(bn);
}

export const generate = action({
  args: { patientId: v.string() },
  handler: async (ctx, { patientId }) => {
    await ctx.runMutation(internal.patients.ensurePatients, {});
    const known = await ctx.runQuery(internal.patients.getScheduling, { patientId });
    if (!known) return { error: "Unknown patient" };

    const gateway = makeAgent(convexGateway("openai/gpt-4o-mini"));
    let threadId = await ctx.runQuery(internal.patients.getThread, { patientId });
    if (!threadId) {
      const created = await gateway.createThread(ctx, { userId: patientId, title: patientId });
      threadId = created.threadId;
      await ctx.runMutation(internal.patients.saveThread, { patientId, threadId });
    }

    const prompt = `Draft the reminder for patient ${patientId}. Call getPatient and searchPolicy first.`;
    let text = "";
    try {
      const { thread } = await gateway.continueThread(ctx, { threadId, userId: patientId });
      const result = await thread.generateText({ prompt });
      text = result.text;
    } catch {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return { error: "Draft generation failed. Please try again." };
      const fallback = makeAgent(createOpenAI({ apiKey: key }).chat("gpt-4o-mini"));
      const { thread } = await fallback.continueThread(ctx, { threadId, userId: patientId });
      const result = await thread.generateText({ prompt });
      text = result.text;
    }

    const draft = parseDraft(text);
    if (!draft) return { error: "Draft generation failed. Please try again." };
    if (rejected(draft.en, draft.bn)) {
      return { error: "Draft rejected. It included clinical content." };
    }
    await ctx.runMutation(internal.patients.saveDraft, { patientId, threadId, ...draft });
    return { threadId, en: draft.en, bn: draft.bn };
  },
});
