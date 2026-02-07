import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

const admin = new Hono();

admin.get('/admin', (c) => {
  return c.redirect('/ui/index.html');
});

admin.use('/ui/*', serveStatic({ root: './' }));

export { admin };
