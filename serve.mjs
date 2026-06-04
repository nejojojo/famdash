// Minimal static file server for the dashboard (no deps). `npm run serve` → http://localhost:8080
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const TYPES = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const PORT = process.env.PORT || 8080;

http.createServer(async (req, res) => {
  let path = req.url.split('?')[0];          // ignore query string (e.g. ?operator=1)
  if (path === '/' || path === '') path = '/index.html';
  const ext = path.slice(path.lastIndexOf('.'));
  try {
    const data = await readFile('.' + path);
    res.setHeader('content-type', TYPES[ext] || 'text/plain');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Operator view (shows the answer key): http://localhost:${PORT}/?operator=1`);
});
