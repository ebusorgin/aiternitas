#!/usr/bin/env node
/**
 * Advanced test: simulate authenticated requests
 * This will test if server returns 500 in edge cases with valid credentials
 */
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

async function testWithMockAuth() {
  console.log('='.repeat(60));
  console.log('Testing /api/plugins/test with edge cases');
  console.log('='.repeat(60));

  // Test 1: Valid telegram bot config (no auth) - should return validation error, not 500
  await test('Bot mode - valid structure but missing chatId', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'telegram',
        config: {
          authMode: 'bot',
          botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
        }
      })
    });

    console.log(`   Status: ${res.status}`);
    const data = await res.json();
    console.log(`   Response:`, JSON.stringify(data, null, 2));

    if (res.status === 500) {
      throw new Error(`Server crashed with 500!`);
    }
  });

  // Test 2: Account mode with invalid apiId (string instead of number)
  await test('Account mode - invalid apiId (string)', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'telegram',
        config: {
          authMode: 'account',
          apiId: 'not-a-number',
          apiHash: '3a86bee7a54b8b364f4532c2dc6f91af',
          sessionString: 'fake-session'
        }
      })
    });

    console.log(`   Status: ${res.status}`);
    const data = await res.json();
    console.log(`   Response:`, JSON.stringify(data, null, 2));

    if (res.status === 500) {
      throw new Error(`Server crashed with 500!`);
    }
  });

  // Test 3: Account mode with malformed sessionString
  await test('Account mode - malformed sessionString', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'telegram',
        config: {
          authMode: 'account',
          apiId: '35115172',
          apiHash: '3a86bee7a54b8b364f4532c2dc6f91af',
          sessionString: 'invalid-session-string-that-will-fail'
        }
      })
    });

    console.log(`   Status: ${res.status}`);
    const data = await res.json();
    console.log(`   Response:`, JSON.stringify(data, null, 2));

    if (res.status === 500) {
      throw new Error(`Server crashed with 500!`);
    }
  });

  // Test 4: Unsupported plugin
  await test('Unsupported pluginId', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'slack',
        config: {}
      })
    });

    console.log(`   Status: ${res.status}`);
    const data = await res.json();
    console.log(`   Response:`, JSON.stringify(data, null, 2));

    if (res.status === 500) {
      throw new Error(`Server crashed with 500!`);
    }
  });

  // Test 5: Very large payload
  await test('Very large config payload', async () => {
    const largeConfig = {
      authMode: 'bot',
      botToken: 'a'.repeat(10000)
    };

    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'telegram',
        config: largeConfig
      })
    });

    console.log(`   Status: ${res.status}`);
    if (res.status === 500) {
      const data = await res.json();
      console.log(`   Response:`, JSON.stringify(data, null, 2));
      throw new Error(`Server crashed with 500!`);
    }
  });

  // Test 6: Config with unexpected fields
  await test('Config with unexpected fields', async () => {
    const res = await fetch(`${BASE_URL}/api/plugins/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'telegram',
        config: {
          authMode: 'bot',
          botToken: '123456:ABC',
          defaultChatId: '123',
          unexpectedField: 'should not crash',
          __proto__: { malicious: 'injection' }
        }
      })
    });

    console.log(`   Status: ${res.status}`);
    const data = await res.json();
    console.log(`   Response:`, JSON.stringify(data, null, 2));

    if (res.status === 500) {
      throw new Error(`Server crashed with 500!`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('Summary: Testing if server returns 500 in ANY case');
  console.log('Expected: Server should NEVER return 500 for validation errors');
  console.log('Expected: Server should return 401 (no auth) or 400 (bad request)');
  console.log('='.repeat(60));
}

testWithMockAuth().catch(console.error);
