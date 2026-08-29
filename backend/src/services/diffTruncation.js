// Truncation strategy for text sent to the LLM (Ollama).
//
// Why this exists: llama3.2:3b is served locally with an explicit num_ctx (see
// config.ollama.numCtx, default 4096 tokens) covering prompt + diff + output. Using the
// common ~4 chars/token heuristic, 4096 tokens is ~16,000 characters total. A single PR
// diff can easily be 10-100x that, so we cannot send raw patches for anything but small
// diffs — we must budget characters deliberately, not just hope truncation "happens".
//
// The concrete strategy (all limits centralized in config.diffTruncation):
//   1. Files are ranked most-relevant-first: sensitive files > files with more changes.
//      (Reviewers care most about what changed in security/config-relevant files, and
//      about the files with the largest blast radius.)
//   2. Each file's patch text is truncated to `maxCharsPerFile` chars (with a marker),
//      so one giant file can't crowd out every other file.
//   3. Files are added in ranked order until either `maxFilesWithPatch` files have been
//      included, or the running total would exceed `maxTotalChars` — whichever comes first.
//   4. Any remaining files are listed by name + additions/deletions only (no patch body),
//      so the model still knows they exist even though it can't see their content.
//
// This function is pure (no I/O) and independent of risk scoring, which reads GitHub's
// file-level stats directly and is never truncated.

const TRUNCATION_MARKER = '\n...[patch truncated]...';
const SECTION_SEPARATOR = '\n\n';
// Below this many characters a patch fragment is noise rather than signal, so the file is
// listed by name instead of being given a useless sliver of its diff.
const MIN_USEFUL_PATCH_CHARS = 200;

function isSensitive(filename, sensitiveRegexes) {
  return sensitiveRegexes.some((re) => re.test(filename));
}

/**
 * Builds the "files we couldn't show in full" tail, bounded by both a file count and a
 * character reserve so it can never consume the budget meant for actual patch content.
 */
function buildOmittedFilesSection(omittedFiles, limits) {
  const listed = omittedFiles.slice(0, limits.maxOmittedFilesListed);
  const lines = listed.map((filename) => `- ${filename}`);
  if (omittedFiles.length > listed.length) {
    lines.push(`- ...and ${omittedFiles.length - listed.length} more file(s)`);
  }
  const section = `Additional files changed but not shown in full (${omittedFiles.length}):\n${lines.join('\n')}`;
  return section.slice(0, limits.tailReserveChars);
}

/**
 * @param {Array<{filename:string, status?:string, additions?:number, deletions?:number, changes?:number, patch?:string}>} files
 * @param {{maxTotalChars:number, maxCharsPerFile:number, maxFilesWithPatch:number}} limits
 * @param {RegExp[]} [sensitiveRegexes] optional, used only to prioritize ordering
 * @returns {{text:string, wasTruncated:boolean, includedFiles:string[], omittedFiles:string[]}}
 */
export function buildDiffTextForLLM(files, limits, sensitiveRegexes = []) {
  const ranked = [...files].sort((a, b) => {
    const aSensitive = isSensitive(a.filename, sensitiveRegexes);
    const bSensitive = isSensitive(b.filename, sensitiveRegexes);
    if (aSensitive !== bSensitive) return aSensitive ? -1 : 1;
    const aChanges = a.changes ?? (a.additions ?? 0) + (a.deletions ?? 0);
    const bChanges = b.changes ?? (b.additions ?? 0) + (b.deletions ?? 0);
    return bChanges - aChanges;
  });

  const includedFiles = [];
  const omittedFiles = [];
  const withPatchSections = [];
  let usedChars = 0;
  let wasTruncated = false;

  // The patch sections get the budget minus a reserve for the omitted-files tail. Without
  // this reserve the tail is unbounded: a 300-file change would append ~300 filename lines
  // after the budget was already spent, overflowing the model's context and pushing the
  // JSON-output instruction out of the prompt.
  const patchBudget = Math.max(0, limits.maxTotalChars - limits.tailReserveChars);

  for (const file of ranked) {
    const header = `File: ${file.filename} (${file.status ?? 'modified'}, +${file.additions ?? 0}/-${file.deletions ?? 0})`;
    let placed = false;

    if (includedFiles.length < limits.maxFilesWithPatch && file.patch) {
      let patch = file.patch;
      let patchTruncated = false;

      if (patch.length > limits.maxCharsPerFile) {
        patch = patch.slice(0, limits.maxCharsPerFile);
        patchTruncated = true;
      }

      // Budget the WHOLE section (header + newline + patch + marker + separator), not just
      // the patch body — that undercount is what let the old version overshoot.
      const overhead = header.length + 1 + TRUNCATION_MARKER.length + SECTION_SEPARATOR.length;
      const roomForPatch = patchBudget - usedChars - overhead;

      if (roomForPatch >= MIN_USEFUL_PATCH_CHARS) {
        if (patch.length > roomForPatch) {
          patch = patch.slice(0, roomForPatch);
          patchTruncated = true;
        }
        const section = `${header}\n${patch}${patchTruncated ? TRUNCATION_MARKER : ''}`;
        withPatchSections.push(section);
        usedChars += section.length + SECTION_SEPARATOR.length;
        includedFiles.push(file.filename);
        if (patchTruncated) wasTruncated = true;
        placed = true;
      }
    }

    if (!placed) {
      omittedFiles.push(file.filename);
      if (file.patch) wasTruncated = true;
    }
  }

  const parts = [...withPatchSections];
  if (omittedFiles.length > 0) {
    parts.push(buildOmittedFilesSection(omittedFiles, limits));
  }

  // Final guarantee: whatever the inputs, the returned text fits the caller's stated budget.
  const text = parts.join(SECTION_SEPARATOR).slice(0, limits.maxTotalChars);

  return {
    text,
    wasTruncated,
    includedFiles,
    omittedFiles,
  };
}
