#!/usr/bin/env node
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function test(name, fn) {
  try {
    console.log(`\n🧪 ${name}`);
    await fn();
    console.log(`✅ PASS`);
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
  }
}

async function testPluginEndpoint() {
  console.log('='.repeat(60));
  console.log('Testing /api/plugins/test endpoint');
  console.log('='.repeat(60));

  // Test 1: No auth - should return 401, not 500
  await test('No authentication (should return 401)', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId: 'telegram', config: {} })
    });

    console.log(`   Status: ${res.status}`);
    const data = await res.json();
    console.log(`   Response:`, data);

    if (res.status === 500) {
      throw new Error(`Expected 401, got 500 - Server should not crash!`);
    }
    if (res.status !== 401) {
      throw new Error(`Expected 401, got ${res.status}`);
    }
  });

  // Test 2: Missing pluginId
  await test('Missing pluginId (should return 400)', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: {} })
    });

    console.log(`   Status: ${res.status}`);
    if (res.status !== 401 && res.status !== 400) {
      const data = await res.json();
      console.log(`   Response:`, data);
      throw new Error(`Expected 401 or 400, got ${res.status}`);
    }
  });

  // Test 3: Invalid config (empty)
  await test('Empty config (should return 400 or 401)', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId: 'telegram', config: null })
    });

    console.log(`   Status: ${res.status}`);
    if (res.status !== 401 && res.status !== 400) {
      const data = await res.json();
      console.log(`   Response:`, data);
      throw new Error(`Expected 401 or 400, got ${res.status}`);
    }
  });

  // Test 4: Bot mode without token
  await test('Bot mode - missing token (should return 400 after auth)', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'telegram',
        config: { authMode: 'bot' }
      })
    });

    console.log(`   Status: ${res.status}`);
    const data = await res.json();
    console.log(`   Response:`, data);

    // Without auth, should be 401
    if (res.status !== 401) {
      throw new Error(`Expected 401 (no auth), got ${res.status}`);
    }
  });

  // Test 5: Account mode with your real credentials (no auth)
  await test('Account mode - with real API credentials (no auth)', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'telegram',
        config: {
          authMode: 'account',
          apiId: '35115172',
          apiHash: '3a86bee7a54b8b364f4532c2dc6f91af'
        }
      })
    });

    console.log(`   Status: ${res.status}`);
    const data = await res.json();
    console.log(`   Response:`, data);

    if (res.status === 500) {
      throw new Error(`Server crashed with 500 - this should NOT happen!`);
    }
    if (res.status !== 401) {
      throw new Error(`Expected 401 (no auth), got ${res.status}`);
    }
  });

  // Test 6: Invalid JSON
  await test('Invalid JSON (should return 400)', async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/plugins/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      console.log(`   Status: ${res.status}`);
      if (res.status !== 400) {
        const data = await res.text();
        console.log(`   Response:`, data);
      }
    } catch (e) {
      console.log(`   Error caught (expected):`, e.message);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed');
  console.log('='.repeat(60));
}

testPluginEndpoint().catch(console.error);
