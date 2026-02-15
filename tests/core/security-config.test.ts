/**
 * Security Config Unit Tests
 *
 * Tests for the security tier configuration system.
 */

import { describe, it, expect } from 'vitest';
import {
  SecurityTier,
  TIER_CONFIG,
  getTierConfig,
  isValidTier,
  compareTiers,
  getMoreSecureTier,
  CSP_RECOMMENDATIONS,
  SECURITY_HEADERS
} from '../../src/core/security-config.js';

describe('SecurityTier', () => {
  it('should define exactly 4 security tiers', () => {
    const tiers = Object.values(SecurityTier);
    expect(tiers).toHaveLength(4);
  });

  it('should have correct tier values', () => {
    expect(SecurityTier.PUBLIC).toBe('public');
    expect(SecurityTier.AUTHENTICATED).toBe('authenticated');
    expect(SecurityTier.SENSITIVE).toBe('sensitive');
    expect(SecurityTier.CRITICAL).toBe('critical');
  });

  it('should be frozen (immutable)', () => {
    expect(Object.isFrozen(SecurityTier)).toBe(true);
  });
});

describe('TIER_CONFIG', () => {
  it('should have configuration for all tiers', () => {
    expect(TIER_CONFIG.public).toBeDefined();
    expect(TIER_CONFIG.authenticated).toBeDefined();
    expect(TIER_CONFIG.sensitive).toBeDefined();
    expect(TIER_CONFIG.critical).toBeDefined();
  });

  it('should have ascending security levels', () => {
    expect(TIER_CONFIG.public.level).toBe(1);
    expect(TIER_CONFIG.authenticated.level).toBe(2);
    expect(TIER_CONFIG.sensitive.level).toBe(3);
    expect(TIER_CONFIG.critical.level).toBe(4);
  });

  it('should be frozen (immutable)', () => {
    expect(Object.isFrozen(TIER_CONFIG)).toBe(true);
    expect(Object.isFrozen(TIER_CONFIG.public)).toBe(true);
    expect(Object.isFrozen(TIER_CONFIG.critical)).toBe(true);
  });

  describe('PUBLIC tier', () => {
    const config = TIER_CONFIG.public;

    it('should have correct name and level', () => {
      expect(config.name).toBe('Public');
      expect(config.level).toBe(1);
    });

    it('should allow autocomplete and caching', () => {
      expect(config.storage.allowAutocomplete).toBe(true);
      expect(config.storage.allowCache).toBe(true);
      expect(config.storage.allowHistory).toBe(true);
    });

    it('should have masking disabled', () => {
      expect(config.masking.enabled).toBe(false);
    });

    it('should have audit logging disabled', () => {
      expect(config.audit.logAccess).toBe(false);
      expect(config.audit.logChanges).toBe(false);
      expect(config.audit.logSubmission).toBe(false);
    });

    it('should have rate limiting disabled', () => {
      expect(config.rateLimit.enabled).toBe(false);
    });
  });

  describe('AUTHENTICATED tier', () => {
    const config = TIER_CONFIG.authenticated;

    it('should have correct name and level', () => {
      expect(config.name).toBe('Authenticated');
      expect(config.level).toBe(2);
    });

    it('should allow autocomplete but not caching', () => {
      expect(config.storage.allowAutocomplete).toBe(true);
      expect(config.storage.allowCache).toBe(false);
      expect(config.storage.allowHistory).toBe(false);
    });

    it('should have audit logging for changes', () => {
      expect(config.audit.logAccess).toBe(false);
      expect(config.audit.logChanges).toBe(true);
      expect(config.audit.logSubmission).toBe(true);
    });
  });

  describe('SENSITIVE tier', () => {
    const config = TIER_CONFIG.sensitive;

    it('should have correct name and level', () => {
      expect(config.name).toBe('Sensitive');
      expect(config.level).toBe(3);
    });

    it('should disable autocomplete and caching', () => {
      expect(config.storage.allowAutocomplete).toBe(false);
      expect(config.storage.allowCache).toBe(false);
      expect(config.storage.allowHistory).toBe(false);
    });

    it('should have full audit logging', () => {
      expect(config.audit.logAccess).toBe(true);
      expect(config.audit.logChanges).toBe(true);
      expect(config.audit.logSubmission).toBe(true);
      expect(config.audit.includeMetadata).toBe(true);
    });

    it('should have rate limiting enabled', () => {
      expect(config.rateLimit.enabled).toBe(true);
      expect(config.rateLimit.maxAttempts).toBe(10);
      expect(config.rateLimit.windowMs).toBe(60000);
    });

    it('should require strict validation', () => {
      expect(config.validation.required).toBe(true);
      expect(config.validation.strict).toBe(true);
    });
  });

  describe('CRITICAL tier', () => {
    const config = TIER_CONFIG.critical;

    it('should have correct name and level', () => {
      expect(config.name).toBe('Critical');
      expect(config.level).toBe(4);
    });

    it('should disable all storage features', () => {
      expect(config.storage.allowAutocomplete).toBe(false);
      expect(config.storage.allowCache).toBe(false);
      expect(config.storage.allowHistory).toBe(false);
    });

    it('should have masking enabled', () => {
      expect(config.masking.enabled).toBe(true);
      expect(config.masking.character).toBe('•');
    });

    it('should have stricter rate limiting', () => {
      expect(config.rateLimit.enabled).toBe(true);
      expect(config.rateLimit.maxAttempts).toBe(5);
      expect(config.rateLimit.windowMs).toBe(60000);
    });

    it('should have shorter max length for validation', () => {
      expect(config.validation.maxLength).toBe(256);
    });

    it('should show security badge in UI', () => {
      expect(config.ui.showSecurityBadge).toBe(true);
      expect(config.ui.labelSuffix).toContain('Critical');
    });
  });
});

describe('getTierConfig', () => {
  it('should return correct config for valid tiers', () => {
    expect(getTierConfig('public').name).toBe('Public');
    expect(getTierConfig('authenticated').name).toBe('Authenticated');
    expect(getTierConfig('sensitive').name).toBe('Sensitive');
    expect(getTierConfig('critical').name).toBe('Critical');
  });

  it('should fail secure - default to CRITICAL for invalid tier', () => {
    const config = getTierConfig('invalid-tier');
    expect(config.name).toBe('Critical');
    expect(config.level).toBe(4);
  });

  it('should fail secure - default to CRITICAL for empty string', () => {
    const config = getTierConfig('');
    expect(config.level).toBe(4);
  });

  it('should fail secure - default to CRITICAL for null-like values', () => {
    const config = getTierConfig(null as any);
    expect(config.level).toBe(4);
  });
});

describe('isValidTier', () => {
  it('should return true for valid tier strings', () => {
    expect(isValidTier('public')).toBe(true);
    expect(isValidTier('authenticated')).toBe(true);
    expect(isValidTier('sensitive')).toBe(true);
    expect(isValidTier('critical')).toBe(true);
  });

  it('should return false for invalid tier strings', () => {
    expect(isValidTier('invalid')).toBe(false);
    expect(isValidTier('PUBLIC')).toBe(false); // Case sensitive
    expect(isValidTier('')).toBe(false);
    expect(isValidTier('high')).toBe(false);
    expect(isValidTier('low')).toBe(false);
  });
});

describe('compareTiers', () => {
  it('should return -1 when first tier is less secure', () => {
    expect(compareTiers('public', 'critical')).toBe(-1);
    expect(compareTiers('public', 'authenticated')).toBe(-1);
    expect(compareTiers('authenticated', 'sensitive')).toBe(-1);
    expect(compareTiers('sensitive', 'critical')).toBe(-1);
  });

  it('should return 0 when tiers are equal', () => {
    expect(compareTiers('public', 'public')).toBe(0);
    expect(compareTiers('critical', 'critical')).toBe(0);
  });

  it('should return 1 when first tier is more secure', () => {
    expect(compareTiers('critical', 'public')).toBe(1);
    expect(compareTiers('sensitive', 'authenticated')).toBe(1);
  });

  it('should treat invalid tiers as CRITICAL', () => {
    // Invalid tier defaults to CRITICAL (level 4)
    expect(compareTiers('invalid', 'public')).toBe(1);
    expect(compareTiers('invalid', 'critical')).toBe(0);
  });
});

describe('getMoreSecureTier', () => {
  it('should return the more secure tier', () => {
    expect(getMoreSecureTier('public', 'critical')).toBe('critical');
    expect(getMoreSecureTier('critical', 'public')).toBe('critical');
    expect(getMoreSecureTier('authenticated', 'sensitive')).toBe('sensitive');
  });

  it('should return first tier when equal', () => {
    expect(getMoreSecureTier('critical', 'critical')).toBe('critical');
    expect(getMoreSecureTier('public', 'public')).toBe('public');
  });
});

describe('CSP_RECOMMENDATIONS', () => {
  it('should have CSP directives for all tiers', () => {
    expect(CSP_RECOMMENDATIONS.public).toBeDefined();
    expect(CSP_RECOMMENDATIONS.authenticated).toBeDefined();
    expect(CSP_RECOMMENDATIONS.sensitive).toBeDefined();
    expect(CSP_RECOMMENDATIONS.critical).toBeDefined();
  });

  it('should have default-src directive for all tiers', () => {
    expect(CSP_RECOMMENDATIONS.public['default-src']).toContain("'self'");
    expect(CSP_RECOMMENDATIONS.critical['default-src']).toContain("'self'");
  });

  it('should have stricter CSP for CRITICAL tier', () => {
    const criticalCSP = CSP_RECOMMENDATIONS.critical;
    expect(criticalCSP['frame-ancestors']).toContain("'none'");
    expect(criticalCSP['base-uri']).toContain("'none'");
    expect('upgrade-insecure-requests' in criticalCSP).toBe(true);
    expect('block-all-mixed-content' in criticalCSP).toBe(true);
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(CSP_RECOMMENDATIONS)).toBe(true);
  });
});

describe('SECURITY_HEADERS', () => {
  it('should define recommended security headers', () => {
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(SECURITY_HEADERS['X-XSS-Protection']).toBe('1; mode=block');
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('should restrict permissions', () => {
    expect(SECURITY_HEADERS['Permissions-Policy']).toContain('geolocation=()');
    expect(SECURITY_HEADERS['Permissions-Policy']).toContain('microphone=()');
    expect(SECURITY_HEADERS['Permissions-Policy']).toContain('camera=()');
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(SECURITY_HEADERS)).toBe(true);
  });
});
