const http = require('http');
const { app, startServer } = require('../index');

async function verify() {
  console.log('[PROBE] Booting server for full verification...');
  const server = await startServer();

  async function get(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:3000${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }).on('error', reject);
    });
  }

  // 1. Health check
  const health = await get('/api/health');
  console.log('✓ Health check status:', health.status, JSON.parse(health.body).status);

  // 2. Index HTML
  const index = await get('/');
  console.log('✓ Public frontend served:', index.status, index.body.includes('CampusTransit Portal'));

  // 3. Close server
  server.close();
  console.log('[PROBE] Verification completed successfully.');
  process.exit(0);
}

verify().catch(err => {
  console.error('[PROBE ERROR]', err);
  process.exit(1);
});

