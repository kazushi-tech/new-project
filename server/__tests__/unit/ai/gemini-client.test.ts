import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiError } from '../../../src/ai/types.js';

// Mock @google/generative-ai
const mockGenerateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

import { callGemini, MAX_INPUT_CHARS } from '../../../src/ai/gemini-client.js';

beforeEach(() => {
  mockGenerateContent.mockReset();
});

describe('callGemini', () => {
  it('returns response text on success', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'test response' },
    });

    const result = await callGemini('test-key', 'test prompt');
    expect(result).toBe('test response');
  });

  it('throws input_too_large when input exceeds limit', async () => {
    const hugeInput = 'x'.repeat(MAX_INPUT_CHARS + 1);

    try {
      await callGemini('test-key', hugeInput);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GeminiError);
      expect((err as GeminiError).category).toBe('input_too_large');
    }
  });

  it('throws invalid_response when response is empty', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => '' },
    });

    try {
      await callGemini('test-key', 'test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GeminiError);
      expect((err as GeminiError).category).toBe('invalid_response');
    }
  });

  it('classifies auth errors correctly', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('401 API key not valid'));

    try {
      await callGemini('test-key', 'test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GeminiError);
      expect((err as GeminiError).category).toBe('auth_failure');
    }
  });

  it('retries on rate limit errors', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('429 Rate limit exceeded'))
      .mockResolvedValueOnce({
        response: { text: () => 'success after retry' },
      });

    const result = await callGemini('test-key', 'test');
    expect(result).toBe('success after retry');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx errors', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValueOnce({
        response: { text: () => 'recovered' },
      });

    const result = await callGemini('test-key', 'test');
    expect(result).toBe('recovered');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry on auth failure', async () => {
    mockGenerateContent.mockRejectedValue(new Error('403 Forbidden'));

    await expect(callGemini('test-key', 'test')).rejects.toThrow(GeminiError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});
