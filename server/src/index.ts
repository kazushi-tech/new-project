import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config.js';

serve({
  fetch: app.fetch,
  port: env.port,
}, (info) => {
  console.log(`SpecForge Review API running on http://localhost:${info.port}`);
  console.log(`Environment: ${env.nodeEnv}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /api/review/run');
  console.log('  POST /api/webhooks/github');
});
