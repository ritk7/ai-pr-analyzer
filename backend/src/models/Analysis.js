import mongoose from 'mongoose';

const { Schema } = mongoose;

// One document per (repo, type, externalId). Re-analyzing the same commit/PR UPSERTS this
// document rather than inserting a duplicate: risk/summary can legitimately change as a PR
// gains commits, and a dashboard showing two rows for the same PR would be confusing. We
// keep firstAnalyzedAt to preserve "when we first saw this" and lastAnalyzedAt to show
// "how fresh is this analysis" — both are useful and neither requires duplicate rows.
const analysisSchema = new Schema(
  {
    repo: { type: String, required: true, index: true }, // "owner/repo"
    type: { type: String, enum: ['commit', 'pull_request'], required: true },
    externalId: { type: String, required: true }, // commit sha, or PR number as a string
    title: { type: String, required: true },
    author: String,
    url: String,
    sourceCreatedAt: Date,

    summary: String,
    qualityNote: String,
    llmOutputMalformed: { type: Boolean, default: false },
    llmAnalysisFailed: { type: Boolean, default: false },
    llmFailureReason: { type: String, default: null },

    riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true, index: true },
    riskScore: { type: Number, required: true },
    riskReasoning: { type: [String], default: [] },

    diffStats: {
      additions: { type: Number, default: 0 },
      deletions: { type: Number, default: 0 },
      changedFiles: { type: Number, default: 0 },
      sensitiveFiles: { type: [String], default: [] },
      testFilesIncluded: { type: [String], default: [] },
      diffTruncatedForLLM: { type: Boolean, default: false },
      // False when GitHub returned only part of the changed-file list, meaning sensitiveFiles
      // and testFilesIncluded above are a lower bound rather than the complete set.
      fileListComplete: { type: Boolean, default: true },
    },

    firstAnalyzedAt: { type: Date, default: Date.now },
    lastAnalyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

analysisSchema.index({ repo: 1, type: 1, externalId: 1 }, { unique: true });

/**
 * Upsert-by-(repo, type, externalId). See schema comment above for why upsert (not insert)
 * is the chosen duplicate-handling strategy.
 */
analysisSchema.statics.upsertAnalysis = async function upsertAnalysis(data) {
  const { repo, type, externalId, ...rest } = data;
  return this.findOneAndUpdate(
    { repo, type, externalId },
    {
      $set: { repo, type, externalId, ...rest, lastAnalyzedAt: new Date() },
      $setOnInsert: { firstAnalyzedAt: new Date() },
    },
    { upsert: true, new: true, runValidators: true },
  );
};

export const Analysis = mongoose.model('Analysis', analysisSchema);
