import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  scheduling: defineTable({
    patientId: v.string(),
    name: v.string(),
    lang: v.union(v.literal("bn"), v.literal("en")),
    lastVisit: v.string(),
    nextRecall: v.string(),
    status: v.string(),
    hasPhone: v.boolean(),
    threadId: v.optional(v.string()),
  }).index("by_patient", ["patientId"]),
  policyChunks: defineTable({
    text: v.string(),
    embedding: v.array(v.float64()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
  }),
  drafts: defineTable({
    patientId: v.string(),
    en: v.string(),
    bn: v.string(),
    threadId: v.string(),
    approved: v.boolean(),
  }).index("by_patient", ["patientId"]),
});
