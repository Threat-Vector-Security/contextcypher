const http = require('http');
const fs = require('fs');
const path = require('path');

const host = process.env.FRONTEND_HOST || '127.0.0.1';
const port = Number(process.env.FRONTEND_PORT || 3000);
const buildDir = path.resolve(__dirname, '..', 'build');
const indexPath = path.join(buildDir, 'index.html');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function setNoCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function sendFile(res, filePath, statusCode = 200, method = 'GET') {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    setNoCache(res);
    res.writeHead(statusCode, {
      'Content-Type': contentType,
      'Content-Length': data.length
    });

    if (method === 'HEAD') {
      res.end();
      return;
    }

    res.end(data);
  });
}

function resolveRequestPath(urlPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch (error) {
    return null;
  }

  const cleanPath = decodedPath.split('?')[0];
  const requestedPath = cleanPath === '/' ? '/index.html' : cleanPath;
  const relativePath = requestedPath.replace(/^\/+/, '');
  const fullPath = path.resolve(buildDir, relativePath);

  if (!fullPath.startsWith(buildDir)) {
    return null;
  }

  return fullPath;
}

const server = http.createServer((req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  const requestedFilePath = resolveRequestPath(req.url || '/');
  if (!requestedFilePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  fs.stat(requestedFilePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, requestedFilePath, 200, method);
      return;
    }

    // SPA fallback for client-side routes
    sendFile(res, indexPath, 200, method);
  });
});

server.listen(port, host, () => {
  console.log(`[dev-static-server] Serving ${buildDir}`);
  console.log(`[dev-static-server] Frontend available at http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error('[dev-static-server] Failed to start:', error.message);
  process.exit(1);
});
