import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { health } from './routes/health.js';
import { review } from './routes/review.js';
import { webhook } from './routes/webhook.js';

const app = new Hono();

app.use('*', logger());

app.route('/', health);
app.route('/', review);
app.route('/', webhook);

export { app };
