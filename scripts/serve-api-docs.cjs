const { createReadStream, existsSync, statSync } = require('node:fs');
const { createServer } = require('node:http');
const { extname, join, normalize } = require('node:path');

const port = Number(process.env.DOCS_PORT || 4173);
const root = join(process.cwd(), 'api-docs-local');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer((request, response) => {
  const requestedPath = request.url === '/' ? '/index.html' : request.url;
  const filePath = normalize(join(root, requestedPath.split('?')[0]));

  if (
    !filePath.startsWith(root) ||
    !existsSync(filePath) ||
    !statSync(filePath).isFile()
  ) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Swagger local disponible en http://127.0.0.1:${port}`);
  console.log('Presiona Ctrl+C para cerrarlo.');
});
