#!/usr/bin/env node
/**
 * Simulate browser request with CORS headers
 */
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

console.log('='.repeat(60));
console.log('Simulating browser request to /api/plugins/test');
console.log('='.repeat(60));

async function simulateBrowserRequest() {
  console.log('\n📡 Sending POST request with browser-like headers...\n');

  const response = await fetch(`${BASE_URL}/api/plugins/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    },
    credentials: 'include',
    body: JSON.stringify({
      pluginId: 'telegram',
      config: {
        authMode: 'account',
        apiId: '35115172',
        apiHash: '3a86bee7a54b8b364f4532c2dc6f91af'
      }
    })
  });

  console.log('Response:');
  console.log('  Status:', response.status, response.statusText);
  console.log('  Headers:', Object.fromEntries(response.headers.entries()));

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    const data = await response.json();
    console.log('  Body:', JSON.stringify(data, null, 2));
  } else {
    const text = await response.text();
    console.log('  Body:', text);
  }

  if (response.status === 500) {
    console.log('\n❌ CRITICAL: Server returned 500!');
    console.log('This should NOT happen for validation/auth errors.');
  } else if (response.status === 401) {
    console.log('\n✅ Correct: Server returned 401 (Unauthorized)');
  } else if (response.status === 400) {
    console.log('\n✅ Correct: Server returned 400 (Bad Request)');
  } else {
    console.log(`\n⚠️  Unexpected status: ${response.status}`);
  }
}

simulateBrowserRequest().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
});
