/**
 * Plan Tool Constants
 * Reuses mission-state storage caps with strict scoping for .matrixx/plans/*.md
 */

export const PLANS_DIR = ".matrixx/plans"

export const MAX_PLAN_FILE_BYTES = 102_400

export const PLAN_FILENAME_KEBAB_REGEX = /^[a-z0-9-]+\.md$/

export const PLAN_BASENAME_KEBAB_REGEX = /^[a-z0-9-]+$/

export const META_TAG_PREFIX = "<!-- plan-persister:"

export const META_TAG_SUFFIX = "-->"
