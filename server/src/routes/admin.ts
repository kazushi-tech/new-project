import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { env } from '../config.js';

const admin = new Hono();

// Production guard: block admin UI when ADMIN_UI_TOKEN is not configured
admin.use('*', async (c, next) => {
  if (env.nodeEnv === 'production' && !env.adminUiToken) {
    return c.json({ error: 'Service unavailable' }, 503);
  }
  await next();
});

admin.get('/admin', (c) => {
  return c.redirect('/ui/index.html');
});

admin.use('/ui/*', serveStatic({ root: './' }));

export { admin };
