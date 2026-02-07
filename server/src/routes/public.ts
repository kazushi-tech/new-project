import { Hono } from 'hono';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../config.js';

const publicApi = new Hono();

publicApi.get('/api/public/status', (c) => {
  let allowedApis: string[] = ['github', 'google-gemini-flash'];
  try {
    const { parse: parseYaml } = require('yaml');
    const configPath = path.resolve(PROJECT_ROOT, '.specforge', 'config.yml');
    const raw = readFileSync(configPath, 'utf-8');
    const yml = parseYaml(raw);
    if (Array.isArray(yml.allowed_apis)) {
      allowedApis = yml.allowed_apis;
    }
  } catch {
    // fallback to defaults
  }

  return c.json({
    service: 'ok',
    engine: 'rule-based',
    allowedApis,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

publicApi.get('/api/public/reviews/latest', (c) => {
  const reviewsDir = path.resolve(PROJECT_ROOT, 'reviews');
  const MAX_LENGTH = 4096;

  try {
    const prDirs = readdirSync(reviewsDir).filter((d) =>
      d.startsWith('pr-') && statSync(path.join(reviewsDir, d)).isDirectory()
    );

    let latestFile: string | null = null;
    let latestMtime = 0;

    for (const dir of prDirs) {
      const reportPath = path.join(reviewsDir, dir, 'latest-report.md');
      try {
        const st = statSync(reportPath);
        if (st.mtimeMs > latestMtime) {
          latestMtime = st.mtimeMs;
          latestFile = reportPath;
        }
      } catch {
        // skip missing
      }
    }

    if (!latestFile) {
      return c.json({ error: 'no review reports found' }, 404);
    }

    let content = readFileSync(latestFile, 'utf-8');
    let truncated = false;
    if (content.length > MAX_LENGTH) {
      content = content.slice(0, MAX_LENGTH);
      truncated = true;
    }

    return c.json({
      content,
      truncated,
      source: path.relative(PROJECT_ROOT, latestFile),
      lastModified: new Date(latestMtime).toISOString(),
    });
  } catch {
    return c.json({ error: 'no review reports found' }, 404);
  }
});

export { publicApi };
