import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProcessEnv = vi.hoisted(() => ({
  GEMINI_API_KEY: '',
  REVIEW_PROVIDER: 'auto',
  NODE_ENV: 'development',
}));

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

describe('getReviewProviderConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns rule-based when auto and no API key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('REVIEW_PROVIDER', 'auto');
    const { getReviewProviderConfig } = await import('../../../src/config.js');
    const config = getReviewProviderConfig();
    expect(config.configured).toBe('rule-based');
    expect(config.effective).toBe('rule-based');
    expect(config.geminiConfigured).toBe(false);
    vi.unstubAllEnvs();
  });

  it('returns gemini when auto and API key is set', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('REVIEW_PROVIDER', 'auto');
    const { getReviewProviderConfig } = await import('../../../src/config.js');
    const config = getReviewProviderConfig();
    expect(config.configured).toBe('gemini');
    expect(config.effective).toBe('gemini');
    expect(config.geminiConfigured).toBe(true);
    vi.unstubAllEnvs();
  });

  it('returns rule-based when explicitly set even with API key', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('REVIEW_PROVIDER', 'rule-based');
    const { getReviewProviderConfig } = await import('../../../src/config.js');
    const config = getReviewProviderConfig();
    expect(config.configured).toBe('rule-based');
    expect(config.effective).toBe('rule-based');
    vi.unstubAllEnvs();
  });

  it('falls back to rule-based when gemini set but no key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('REVIEW_PROVIDER', 'gemini');
    const { getReviewProviderConfig } = await import('../../../src/config.js');
    const config = getReviewProviderConfig();
    expect(config.configured).toBe('gemini');
    expect(config.effective).toBe('rule-based');
    expect(config.geminiConfigured).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('validateConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws in production when gemini set but no key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('REVIEW_PROVIDER', 'gemini');
    vi.stubEnv('NODE_ENV', 'production');
    const { validateConfig } = await import('../../../src/config.js');
    expect(() => validateConfig()).toThrow('GEMINI_API_KEY is required');
    vi.unstubAllEnvs();
  });

  it('warns in development when gemini set but no key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('REVIEW_PROVIDER', 'gemini');
    vi.stubEnv('NODE_ENV', 'development');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { validateConfig } = await import('../../../src/config.js');
    validateConfig();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('GEMINI_API_KEY is not set')
    );
    consoleSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('does not throw in production when auto with no key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('REVIEW_PROVIDER', 'auto');
    vi.stubEnv('NODE_ENV', 'production');
    const { validateConfig } = await import('../../../src/config.js');
    expect(() => validateConfig()).not.toThrow();
    vi.unstubAllEnvs();
  });
});
