import type { Server } from 'node:http';

// --- Check / assertion utilities ---

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export function createChecker() {
  const results: CheckResult[] = [];

  function check(name: string, passed: boolean, detail?: string) {
    results.push({ name, passed, detail });
    const icon = passed ? '[PASS]' : '[FAIL]';
    const msg = detail ? ` - ${detail}` : '';
    console.log(`  ${icon} ${name}${msg}`);
  }

  function summary(): { total: number; passed: number; failed: number; ok: boolean } {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    console.log(`\n--- Results: ${passed}/${total} passed, ${failed} failed ---`);
    return { total, passed, failed, ok: failed === 0 };
  }

  return { check, summary };
}

// --- Server lifecycle ---

export async function startServer(
  app: { fetch: (req: Request) => Response | Promise<Response> },
  port = 0,
): Promise<{ baseUrl: string; server: Server; close: () => Promise<void> }> {
  const { serve } = await import('@hono/node-server');

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port }, (info) => {
      const baseUrl = `http://localhost:${info.port}`;
      const close = () =>
        new Promise<void>((res, rej) => {
          server.close((err) => (err ? rej(err) : res()));
        });
      resolve({ baseUrl, server, close });
    });
  });
}

// --- HTTP utilities with timeout ---

const DEFAULT_TIMEOUT_MS = 60_000;

export async function fetchJson(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ status: number; body: any }> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...fetchInit, signal: controller.signal });
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
