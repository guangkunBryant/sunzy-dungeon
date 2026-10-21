// Standalone static server for the built webapp — for human play, independent
// of the test harness. Usage: node serve.mjs [port]  (default 8090)
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = join(process.cwd(), '..', 'web', 'build', 'dist', 'webapp');
const PORT = Number(process.argv[2] ?? 8090);
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.css': 'text/css', '.ico': 'image/x-icon', '.atlas': 'text/plain',
};
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const s = await stat(join(DIST, p)).catch(() => null);
    if (!s || s.isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(await readFile(join(DIST, p)));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, '127.0.0.1', () => console.log(`[serve] http://127.0.0.1:${PORT}  <-  ${DIST}`));
