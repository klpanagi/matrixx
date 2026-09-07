// Vendored subset of gitleaks config (Apache-2.0) — curated for input-secret-guard

export interface Rule {
  id: string
  pattern: string
  description: string
  severity: "block" | "warn"
}

export type RuleSeverity = "block" | "warn"

export type DetectionRule = Rule

export const BLOCKLIST_RULES: Rule[] = [
  {
    id: "openai-api-key",
    pattern: "sk-proj-[A-Za-z0-9]{20,}",
    description: "OpenAI project API key (sk-proj-)",
    severity: "block",
  },
  {
    id: "openai-api-key-legacy",
    pattern: "sk-[A-Za-z0-9]{48,}",
    description: "OpenAI legacy API key (sk-)",
    severity: "block",
  },
  {
    id: "openai-bearer",
    pattern: "sk-[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{10,}",
    description: "OpenAI API key with T3BlbkFJ marker",
    severity: "block",
  },
  {
    id: "github-pat",
    pattern: "ghp_[A-Za-z0-9]{36,}",
    description: "GitHub personal access token (ghp_)",
    severity: "block",
  },
  {
    id: "github-oauth",
    pattern: "gho_[A-Za-z0-9]{36,}",
    description: "GitHub OAuth token (gho_)",
    severity: "block",
  },
  {
    id: "github-pat-new",
    pattern: "github_pat_[A-Za-z0-9_]{82,}",
    description: "GitHub fine-grained PAT (github_pat_)",
    severity: "block",
  },
  {
    id: "github-app-token",
    pattern: "ghs_[A-Za-z0-9]{36,}",
    description: "GitHub app installation token (ghs_)",
    severity: "block",
  },
  {
    id: "github-refresh-token",
    pattern: "ghr_[A-Za-z0-9]{36,}",
    description: "GitHub refresh token (ghr_)",
    severity: "block",
  },
  {
    id: "aws-access-key",
    pattern: "AKIA[0-9A-Z]{16}",
    description: "AWS access key ID (AKIA)",
    severity: "block",
  },
  {
    id: "aws-secret-key",
    pattern: "aws_secret_access_key\\s*[:=]\\s*[A-Za-z0-9/+=]{40}",
    description: "AWS secret access key assignment",
    severity: "block",
  },
  {
    id: "aws-session-token",
    pattern: "AQo[A-Za-z0-9/+=]{100,}",
    description: "AWS session token (AQo...)",
    severity: "block",
  },
  {
    id: "gcp-api-key",
    pattern: "AIza[0-9A-Za-z\\-_]{35}",
    description: "Google API key (AIza)",
    severity: "block",
  },
  {
    id: "gcp-service-account",
    pattern: "\"type\"\\s*:\\s*\"service_account\"",
    description: "GCP service account JSON marker",
    severity: "block",
  },
  {
    id: "slack-bot-token",
    pattern: "xoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}",
    description: "Slack bot token (xoxb-)",
    severity: "block",
  },
  {
    id: "slack-user-token",
    pattern: "xoxp-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}",
    description: "Slack user token (xoxp-)",
    severity: "block",
  },
  {
    id: "slack-app-token",
    pattern: "xoxa-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}",
    description: "Slack app token (xoxa-)",
    severity: "block",
  },
  {
    id: "slack-token-generic",
    pattern: "xox[bpras]-[0-9A-Za-z\\-]{10,}",
    description: "Slack token generic (xoxb/xoxp/xoxa/xoxs)",
    severity: "block",
  },
  {
    id: "npm-token",
    pattern: "npm_[A-Za-z0-9]{36,}",
    description: "NPM access token (npm_)",
    severity: "block",
  },
  {
    id: "private-key-rsa",
    pattern: "-----BEGIN RSA PRIVATE KEY-----",
    description: "RSA private key PEM header",
    severity: "block",
  },
  {
    id: "private-key-ec",
    pattern: "-----BEGIN EC PRIVATE KEY-----",
    description: "EC private key PEM header",
    severity: "block",
  },
  {
    id: "private-key-openssh",
    pattern: "-----BEGIN OPENSSH PRIVATE KEY-----",
    description: "OpenSSH private key PEM header",
    severity: "block",
  },
  {
    id: "private-key-generic",
    pattern: "-----BEGIN PRIVATE KEY-----",
    description: "Generic private key PEM header",
    severity: "block",
  },
  {
    id: "private-key-pgp",
    pattern: "-----BEGIN PGP PRIVATE KEY BLOCK-----",
    description: "PGP private key block header",
    severity: "block",
  },
  {
    id: "jwt-bearer",
    pattern: "Bearer eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+",
    description: "JWT Bearer token (Bearer eyJ.)",
    severity: "block",
  },
  {
    id: "jwt-generic",
    pattern: "eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}",
    description: "Generic JWT (eyJ header.payload.signature)",
    severity: "block",
  },
  {
    id: "stripe-live-key",
    pattern: "sk_live_[A-Za-z0-9]{24,}",
    description: "Stripe live secret key (sk_live_)",
    severity: "block",
  },
  {
    id: "stripe-restricted-key",
    pattern: "rk_live_[A-Za-z0-9]{24,}",
    description: "Stripe restricted key (rk_live_)",
    severity: "block",
  },
  {
    id: "sendgrid-api-key",
    pattern: "SG\\.[A-Za-z0-9_-]{22,}\\.[A-Za-z0-9_-]{43,}",
    description: "SendGrid API key (SG.)",
    severity: "block",
  },
  {
    id: "twilio-api-key",
    pattern: "SK[A-Za-z0-9]{32,}",
    description: "Twilio API key (SK)",
    severity: "block",
  },
  {
    id: "heroku-api-key",
    pattern: "heroku[a-z0-9_-]*\\s*[:=]\\s*[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}",
    description: "Heroku API key (UUID assignment)",
    severity: "block",
  },
  {
    id: "discord-bot-token",
    pattern: "[MN][A-Za-z0-9]{23,}\\.[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{27,}",
    description: "Discord bot token",
    severity: "block",
  },
]

export const WARNLIST_HEURISTICS: Rule[] = [
  {
    id: "generic-secret-assignment",
    pattern: "(api[_-]?key|secret|token|password|passwd|pwd|credentials?)\\s*[:=]\\s*['\"]?[^'\"\\s]{8,}['\"]?",
    description: "Generic secret assignment via keyword proximity",
    severity: "warn",
  },
  {
    id: "high-entropy-token",
    pattern: "[A-Za-z0-9+/=]{20,64}",
    description: "High-entropy base64-like token candidate for entropy check",
    severity: "warn",
  },
]

