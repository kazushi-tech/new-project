import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { health } from './routes/health.js';
import { review } from './routes/review.js';
import { webhook } from './routes/webhook.js';
import { publicApi } from './routes/public.js';
import { admin } from './routes/admin.js';

const app = new Hono();

app.use('*', logger());

app.route('/', health);
app.route('/', review);
app.route('/', webhook);
app.route('/', publicApi);
app.route('/', admin);

export { app };
