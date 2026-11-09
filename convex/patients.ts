import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const SEED = [
  { patientId: "BR-10482", name: "Madhumita Ghosh", lang: "bn" as const, lastVisit: "16 May 2025", nextRecall: "16 Aug 2025", status: "overdue", hasPhone: true },
  { patientId: "BR-08831", name: "Subir Dutta", lang: "en" as const, lastVisit: "12 Jun 2025", nextRecall: "12 Sep 2025", status: "overdue", hasPhone: true },
  { patientId: "BR-11602", name: "Nasima Khatun", lang: "bn" as const, lastVisit: "18 Jan 2026", nextRecall: "18 Apr 2026", status: "slipping", hasPhone: true },
  { patientId: "BR-09544", name: "Arindam Sen", lang: "en" as const, lastVisit: "3 Jul 2026", nextRecall: "11 Oct 2026", status: "due", hasPhone: true },
  { patientId: "BR-07319", name: "Bimal Roy", lang: "en" as const, lastVisit: "29 Jun 2025", nextRecall: "29 Sep 2025", status: "overdue", hasPhone: true },
  { patientId: "BR-12177", name: "Rina Das", lang: "bn" as const, lastVisit: "7 Dec 2025", nextRecall: "7 Mar 2026", status: "slipping", hasPhone: true },
];

export const ensurePatients = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("scheduling").take(1);
    if (existing.length > 0) return;
    for (const row of SEED) {
      await ctx.db.insert("scheduling", row);
    }
  },
});

export const getScheduling = internalQuery({
  args: { patientId: v.string() },
  handler: async (ctx, { patientId }) => {
    return await ctx.db
      .query("scheduling")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
  },
});

export const getThread = internalQuery({
  args: { patientId: v.string() },
  handler: async (ctx, { patientId }) => {
    const row = await ctx.db
      .query("scheduling")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
    return row?.threadId ?? null;
  },
});

export const saveThread = internalMutation({
  args: { patientId: v.string(), threadId: v.string() },
  handler: async (ctx, { patientId, threadId }) => {
    const row = await ctx.db
      .query("scheduling")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
    if (row) await ctx.db.patch(row._id, { threadId });
  },
});

export const policyCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("policyChunks").take(1);
    return rows.length;
  },
});

export const savePolicy = internalMutation({
  args: {
    chunks: v.array(v.object({ text: v.string(), embedding: v.array(v.float64()) })),
  },
  handler: async (ctx, { chunks }) => {
    for (const chunk of chunks) {
      await ctx.db.insert("policyChunks", chunk);
    }
  },
});

export const policyByIds = internalQuery({
  args: { ids: v.array(v.id("policyChunks")) },
  handler: async (ctx, { ids }) => {
    const rows = [];
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (row) rows.push({ text: row.text });
    }
    return rows;
  },
});

export const saveDraft = internalMutation({
  args: {
    patientId: v.string(),
    en: v.string(),
    bn: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, approved: false });
      return;
    }
    await ctx.db.insert("drafts", { ...args, approved: false });
  },
});
