import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCourtBridgeHandler } from './courtBridge.mjs';
import { createCourtHttpHandler } from '../dist-server/courtHttp.mjs';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const bridge = createCourtBridgeHandler();
const platform = createCourtHttpHandler({storePath:process.env.COURT_STORE_PATH,publicBaseUrl:process.env.COURT_PUBLIC_BASE_URL});
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  if (await platform(req,res)) return;
  if (await bridge(req, res)) return;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname}`);
    if (path !== root.slice(0, -1) && !path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); res.end(); return; }
    let data; let target = path;
    try { data = await readFile(target); } catch { target = resolve(root, 'index.html'); data = await readFile(target); }
    res.writeHead(200, { 'content-type': mime[extname(target)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('Build the app with npm run build first.'); }
});
server.once('close', () => { bridge.close(); platform.close(); });
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Local court: http://127.0.0.1:${server.address().port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
