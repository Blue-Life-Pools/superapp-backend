const { spawn } = require('node:child_process');

const prismaCli = require.resolve('prisma/build/index.js');

function runMigration() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (status) => resolve(status ?? 1));
    child.on('error', () => resolve(1));
  });
}

(async () => {
  let status = 1;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    status = await runMigration();
    if (status === 0) break;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  process.exit(status);
})();
