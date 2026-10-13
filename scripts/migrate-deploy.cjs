const { spawnSync } = require('node:child_process');

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
  },
});

process.exit(result.status ?? 1);
