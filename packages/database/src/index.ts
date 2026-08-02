export { createDb, bootstrapSchema, type MatterMailDb } from "./client.js";
export * from "./schema/index.js";
export { searchMattersFts, upsertMatterFts } from "./fts.js";
