/**
 * Task ID format: `T-` followed by dash-separated alphanumeric segments.
 * Rejects truncated/empty IDs ("T-"), trailing dashes ("T-abc-"), and
 * double dashes ("T-a--b"). Matches generateTaskId() output (T-{uuid}).
 */
export const TASK_ID_PATTERN = /^T-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/
