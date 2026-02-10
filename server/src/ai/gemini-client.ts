import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiError } from './types.js';

const MODEL_NAME = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_INPUT_CHARS = 100_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyError(err: unknown): GeminiError {
  if (err instanceof GeminiError) return err;

  const message = err instanceof Error ? err.message : String(err);
  const statusMatch = message.match(/(\d{3})/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : undefined;

  if (message.includes('API key') || message.includes('401') || message.includes('403')) {
    return new GeminiError(`Gemini auth failure: ${message}`, 'auth_failure', statusCode);
  }
  if (message.includes('429') || message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('quota')) {
    return new GeminiError(`Gemini rate limited: ${message}`, 'rate_limit', 429);
  }
  if (statusCode && statusCode >= 500) {
    return new GeminiError(`Gemini server error: ${message}`, 'transient', statusCode);
  }
  if (message.includes('timeout') || message.includes('abort') || message.includes('ECONNRESET')) {
    return new GeminiError(`Gemini timeout: ${message}`, 'transient', undefined);
  }
  return new GeminiError(`Gemini error: ${message}`, 'unknown', statusCode);
}

function isRetryable(err: GeminiError): boolean {
  return err.category === 'rate_limit' || err.category === 'transient';
}

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  if (prompt.length > MAX_INPUT_CHARS) {
    throw new GeminiError(
      `Input exceeds maximum size: ${prompt.length} chars (limit: ${MAX_INPUT_CHARS})`,
      'input_too_large',
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  let lastError: GeminiError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.log(`[gemini] Retry ${attempt}/${MAX_RETRIES} after ${backoffMs}ms...`);
      await sleep(backoffMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }, { signal: controller.signal as AbortSignal });

      const text = result.response.text();
      if (!text) {
        throw new GeminiError('Empty response from Gemini', 'invalid_response');
      }
      return text;
    } catch (err) {
      const classified = classifyError(err);
      lastError = classified;

      if (!isRetryable(classified) || attempt === MAX_RETRIES) {
        throw classified;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new GeminiError('Unexpected retry exhaustion', 'unknown');
}

export { MAX_INPUT_CHARS, REQUEST_TIMEOUT_MS, MAX_RETRIES };
