/**
 * Rule file metadata (frontmatter)
 * Supports globs format and GitHub Copilot format (applyTo)
 * @see https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot
 */
export interface RuleMetadata {
  description?: string;
  globs?: string | string[];
  alwaysApply?: boolean;
}

/**
 * Rule file candidate with discovery context
 */
export interface RuleFileCandidate {
  path: string;
  realPath: string;
  isGlobal: boolean;
  distance: number;
  /** Single-file rules (e.g., .github/copilot-instructions.md) always apply without frontmatter */
  isSingleFile?: boolean;
}

/**
 * Session storage for injected rules tracking
 */
export interface InjectedRulesData {
  sessionID: string;
  /** Content hashes of already injected rules */
  injectedHashes: string[];
  /** Real paths of already injected rules (for symlink deduplication) */
  injectedRealPaths: string[];
  updatedAt: number;
}
