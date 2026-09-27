const { copyFile, mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { createSwaggerDocument } = require('../dist/swagger');

const outputDirectory = join(process.cwd(), 'api-docs-local');
const swaggerAssetsDirectory = join(
  process.cwd(),
  'node_modules',
  'swagger-ui-dist',
);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BlueLife CRM API</title>
    <link rel="stylesheet" href="./swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="./swagger-ui-bundle.js"></script>
    <script src="./swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: './openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          persistAuthorization: true,
          displayRequestDuration: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
        });
      };
    </script>
  </body>
</html>`;

async function generateDocs() {
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: ['error'],
  });

  try {
    const document = createSwaggerDocument(app);
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(join(outputDirectory, 'index.html'), html, 'utf8'),
      writeFile(
        join(outputDirectory, 'openapi.json'),
        JSON.stringify(document, null, 2),
        'utf8',
      ),
      copyFile(
        join(swaggerAssetsDirectory, 'swagger-ui.css'),
        join(outputDirectory, 'swagger-ui.css'),
      ),
      copyFile(
        join(swaggerAssetsDirectory, 'swagger-ui-bundle.js'),
        join(outputDirectory, 'swagger-ui-bundle.js'),
      ),
      copyFile(
        join(swaggerAssetsDirectory, 'swagger-ui-standalone-preset.js'),
        join(outputDirectory, 'swagger-ui-standalone-preset.js'),
      ),
    ]);
  } finally {
    await app.close();
  }

  console.log('Documentación generada en api-docs-local/.');
}

generateDocs().catch((error) => {
  console.error('No se pudo generar la documentación:', error);
  process.exitCode = 1;
});
