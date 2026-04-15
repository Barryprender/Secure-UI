/**
 * Security tier definitions and configuration for Secure-UI.
 * Four tiers: public → authenticated → sensitive → critical (fail-secure default).
 */

import type {
  SecurityTierValue,
  TierConfig,
  CSPDirectives,
  SecurityHeaders
} from './types.js';


export const SecurityTier = Object.freeze({
  /** PUBLIC: Non-sensitive data (e.g., search queries, public comments) */
  PUBLIC: 'public' as const,

  /** AUTHENTICATED: User-specific but non-sensitive data (e.g., display names, preferences) */
  AUTHENTICATED: 'authenticated' as const,

  /** SENSITIVE: Personally identifiable information (e.g., email, phone, address) */
  SENSITIVE: 'sensitive' as const,

  /** CRITICAL: High-risk data (e.g., passwords, SSN, payment info) */
  CRITICAL: 'critical' as const
});

export const TIER_CONFIG: Readonly<Record<SecurityTierValue, TierConfig>> = Object.freeze({
  [SecurityTier.PUBLIC]: Object.freeze({
    name: 'Public',
    level: 1,
    validation: Object.freeze({
      required: false,
      strict: false,
      maxLength: 5000,
      pattern: null,
      sanitizeHtml: true
    }),
    masking: Object.freeze({
      enabled: false,
      character: '•',
      partial: false
    }),
    storage: Object.freeze({
      allowAutocomplete: true,
      allowCache: true,
      allowHistory: true
    }),
    audit: Object.freeze({
      logAccess: false,
      logChanges: false,
      logSubmission: false,
      includeMetadata: false
    }),
    rateLimit: Object.freeze({
      enabled: false,
      maxAttempts: 0,
      windowMs: 0
    })
  }),

  [SecurityTier.AUTHENTICATED]: Object.freeze({
    name: 'Authenticated',
    level: 2,
    validation: Object.freeze({
      required: true,
      strict: false,
      maxLength: 1000,
      pattern: null,
      sanitizeHtml: true
    }),
    masking: Object.freeze({
      enabled: false,
      character: '•',
      partial: false
    }),
    storage: Object.freeze({
      allowAutocomplete: true,
      allowCache: false,
      allowHistory: false
    }),
    audit: Object.freeze({
      logAccess: false,
      logChanges: true,
      logSubmission: true,
      includeMetadata: true
    }),
    rateLimit: Object.freeze({
      enabled: false,
      maxAttempts: 0,
      windowMs: 0
    })
  }),

  [SecurityTier.SENSITIVE]: Object.freeze({
    name: 'Sensitive',
    level: 3,
    validation: Object.freeze({
      required: true,
      strict: true,
      maxLength: 500,
      pattern: null,
      sanitizeHtml: true
    }),
    masking: Object.freeze({
      enabled: true,
      character: '•',
      partial: true
    }),
    storage: Object.freeze({
      allowAutocomplete: false,
      allowCache: false,
      allowHistory: false
    }),
    audit: Object.freeze({
      logAccess: true,
      logChanges: true,
      logSubmission: true,
      includeMetadata: true
    }),
    rateLimit: Object.freeze({
      enabled: true,
      maxAttempts: 10,
      windowMs: 60000
    })
  }),

  [SecurityTier.CRITICAL]: Object.freeze({
    name: 'Critical',
    level: 4,
    validation: Object.freeze({
      required: true,
      strict: true,
      maxLength: 256,
      pattern: null,
      sanitizeHtml: true
    }),
    masking: Object.freeze({
      enabled: true,
      character: '•',
      partial: false
    }),
    storage: Object.freeze({
      allowAutocomplete: false,
      allowCache: false,
      allowHistory: false
    }),
    audit: Object.freeze({
      logAccess: true,
      logChanges: true,
      logSubmission: true,
      includeMetadata: true
    }),
    rateLimit: Object.freeze({
      enabled: true,
      maxAttempts: 5,
      windowMs: 60000
    })
  })
});

/** Returns tier config; falls back to CRITICAL for invalid input (fail-secure). */
export function getTierConfig(tier: string): TierConfig {
  if (!tier || !TIER_CONFIG[tier as SecurityTierValue]) {
    console.warn(`Invalid security tier "${tier}", defaulting to CRITICAL`);
    return TIER_CONFIG[SecurityTier.CRITICAL];
  }

  return TIER_CONFIG[tier as SecurityTierValue];
}

export function isValidTier(tier: string): tier is SecurityTierValue {
  return (Object.values(SecurityTier) as string[]).includes(tier);
}

/** Returns -1 / 0 / 1 by tier level. */
export function compareTiers(tier1: SecurityTierValue, tier2: SecurityTierValue): number {
  const config1 = getTierConfig(tier1);
  const config2 = getTierConfig(tier2);

  return Math.sign(config1.level - config2.level);
}

export function getMoreSecureTier(tier1: SecurityTierValue, tier2: SecurityTierValue): SecurityTierValue {
  return compareTiers(tier1, tier2) >= 0 ? tier1 : tier2;
}

export const CSP_RECOMMENDATIONS: Readonly<Record<SecurityTierValue, Readonly<CSPDirectives>>> = Object.freeze({
  [SecurityTier.PUBLIC]: Object.freeze({
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"]
  }),

  [SecurityTier.AUTHENTICATED]: Object.freeze({
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'form-action': ["'self'"]
  }),

  [SecurityTier.SENSITIVE]: Object.freeze({
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': []
  }),

  [SecurityTier.CRITICAL]: Object.freeze({
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': [],
    'block-all-mixed-content': [],
    'base-uri': ["'none'"]
  })
});

export const SECURITY_HEADERS: Readonly<SecurityHeaders> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
});

