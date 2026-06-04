// src/history.js
// Rolling archive index for the daily full-store snapshots saved at history/<date>.json.

// Add `date` to the index, keep it de-duplicated, sorted, and capped to `keep` most-recent days.
// Returns { index } newest-first (for the dashboard date picker) and { pruned } = day dates whose
// history/<date>.json file should be deleted (fell out of the rolling window).
export function updateHistoryIndex(existingIndex, date, keep = 30) {
  const dates = Array.from(new Set([...(existingIndex || []), date])).sort(); // ascending ISO dates
  const kept = dates.slice(-keep);
  const pruned = dates.slice(0, dates.length - kept.length);
  return { index: kept.reverse(), pruned }; // newest-first
}
