import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isStaff } from "./auth";

export const latest = query({
  args: { patientId: v.string(), staffKey: v.string() },
  handler: async (ctx, { patientId, staffKey }) => {
    if (!isStaff(staffKey)) return null;
    const row = await ctx.db
      .query("drafts")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
    if (!row) return null;
    return { en: row.en, bn: row.bn, threadId: row.threadId, approved: row.approved };
  },
});

export const approve = mutation({
  args: { patientId: v.string(), staffKey: v.string() },
  handler: async (ctx, { patientId, staffKey }) => {
    if (!isStaff(staffKey)) return { error: "Staff key required" };
    const row = await ctx.db
      .query("drafts")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
    if (!row) return { error: "No draft to approve" };
    await ctx.db.patch(row._id, { approved: true });
    return { status: "approved" };
  },
});
