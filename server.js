import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import shortid from 'shortid';
import { createClient } from 'redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({ url: REDIS_URL });

client.on('error', (err) => {
  console.error('Redis error:', err);
});

await client.connect();

const app = express();
app.use(cors());
app.use(express.json());

const linksSetKey = 'links';

const detectDeviceType = (ua = '') => {
  const value = ua.toLowerCase();
  if (/mobile|android|iphone|ipad|ipod/.test(value)) return 'mobile';
  return 'desktop';
};

// Create a new short link
app.post('/api/links', async (req, res) => {
  const { url } = req.body || {};
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Only http(s) URLs are allowed.');
    }
  } catch (err) {
    return res.status(400).send('Invalid URL provided.');
  }

  const id = shortid.generate();
  const createdAt = new Date().toISOString();
  const linkKey = `link:${id}`;
  await client.hSet(linkKey, {
    id,
    originalUrl: url,
    createdAt,
    visitCount: 0,
    shortUrl: `${BASE_URL}/${id}`
  });
  await client.sAdd(linksSetKey, id);

  return res.json({
    id,
    originalUrl: url,
    createdAt,
    visitCount: 0,
    shortUrl: `${BASE_URL}/${id}`
  });
});

// List all links
app.get('/api/links', async (_req, res) => {
  const ids = await client.sMembers(linksSetKey);
  const links = await Promise.all(
    ids.map(async (id) => {
      const data = await client.hGetAll(`link:${id}`);
      if (!data || !data.id) return null;
      return {
        id: data.id,
        originalUrl: data.originalUrl,
        createdAt: data.createdAt,
        visitCount: Number(data.visitCount || 0),
        shortUrl: data.shortUrl || `${BASE_URL}/${id}`
      };
    })
  );

  const filtered = links.filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(filtered);
});

// Stats for a specific link
app.get('/api/links/:id/stats', async (req, res) => {
  const { id } = req.params;
  const linkKey = `link:${id}`;
  const link = await client.hGetAll(linkKey);
  if (!link || !link.id) return res.status(404).send('Link not found.');

  const visitsKey = `visits:${id}`;
  const visits = await client.lRange(visitsKey, 0, -1);

  const start = req.query.start ? new Date(req.query.start) : null;
  const end = req.query.end ? new Date(req.query.end) : null;

  const parsedVisits = visits
    .map((entry) => {
      try {
        return JSON.parse(entry);
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .filter((visit) => {
      const ts = new Date(visit.timestamp);
      if (start && ts < start) return false;
      if (end && ts > new Date(end.getTime() + 24 * 60 * 60 * 1000)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json({
    id: link.id,
    originalUrl: link.originalUrl,
    createdAt: link.createdAt,
    visitCount: Number(link.visitCount || 0),
    shortUrl: link.shortUrl || `${BASE_URL}/${id}`,
    visits: parsedVisits
  });
});

// Redirect handler
app.get('/:id', async (req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  const { id } = req.params;
  const linkKey = `link:${id}`;
  const link = await client.hGetAll(linkKey);
  if (!link || !link.id) return next();

  const visitsKey = `visits:${id}`;
  const userAgent = req.get('user-agent') || '';
  const visit = {
    timestamp: new Date().toISOString(),
    userAgent,
    deviceType: detectDeviceType(userAgent)
  };

  await Promise.all([
    client.hIncrBy(linkKey, 'visitCount', 1),
    client.rPush(visitsKey, JSON.stringify(visit))
  ]);

  return res.redirect(link.originalUrl);
});

const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
