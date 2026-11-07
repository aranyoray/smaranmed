"use node";

import { embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const POLICY = [
  "Write a short visit reminder in English and Bengali. Use the first name and the last visit date.",
  "Do not mention HbA1c, lab numbers, insulin, doses, diagnosis, or treatment. A person reviews the draft before anything is sent.",
];

const EMBEDDING_SIZE = 1536;

async function embedValues(values: string[]): Promise<number[][]> {
  try {
    const result = await embedMany({
      model: convexGateway.embeddingModel("openai/text-embedding-3-small"),
      values,
    });
    return result.embeddings;
  } catch (gatewayError) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw gatewayError;
    const openai = createOpenAI({ apiKey: key });
    const result = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values,
    });
    return result.embeddings;
  }
}

export const ensurePolicy = internalAction({
  args: {},
  handler: async (ctx) => {
    const count = await ctx.runQuery(internal.patients.policyCount, {});
    if (count > 0) return { stored: false };
    const embeddings = await embedValues(POLICY);
    if (embeddings.some((row) => row.length !== EMBEDDING_SIZE)) {
      return { stored: false };
    }
    await ctx.runMutation(internal.patients.savePolicy, {
      chunks: POLICY.map((text, index) => ({ text, embedding: embeddings[index] })),
    });
    return { stored: true };
  },
});

export const searchPolicy = internalAction({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<string> => {
    const fallback = POLICY.join("\n");
    try {
      await ctx.runAction(internal.embed.ensurePolicy, {});
      const [vector] = await embedValues([query]);
      if (!vector || vector.length !== EMBEDDING_SIZE) return fallback;
      const hits = await ctx.vectorSearch("policyChunks", "by_embedding", {
        vector,
        limit: 2,
      });
      if (!hits.length) return fallback;
      const docs = await ctx.runQuery(internal.patients.policyByIds, {
        ids: hits.map((hit) => hit._id),
      });
      const text = docs.map((doc) => doc.text).join("\n");
      return text || fallback;
    } catch {
      return fallback;
    }
  },
});
