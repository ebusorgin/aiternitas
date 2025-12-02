// TOR Proxy Service for OpenAI API calls
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import http from 'http';
import pool from '../db.mjs';

// TOR configuration state
let torConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 9050,
  exitCountry: 'US',
};

// Current SOCKS proxy agent
let socksAgent = null;

/**
 * Initialize TOR settings from database
 */
export async function initTorSettings() {
  try {
    const result = await pool.query(
      'SELECT key, value FROM app_settings WHERE key IN ($1, $2, $3, $4)',
      ['tor_enabled', 'tor_exit_country', 'tor_host', 'tor_port']
    );

    result.rows.forEach(row => {
      switch (row.key) {
        case 'tor_enabled':
          torConfig.enabled = row.value === 'true';
          break;
        case 'tor_exit_country':
          torConfig.exitCountry = row.value;
          break;
        case 'tor_host':
          torConfig.host = row.value;
          break;
        case 'tor_port':
          torConfig.port = parseInt(row.value) || 9050;
          break;
      }
    });

    // Also load OpenAI API key if stored
    const apiKeyResult = await pool.query(
      'SELECT value FROM app_settings WHERE key = $1',
      ['openai_api_key']
    );
    if (apiKeyResult.rows.length > 0 && apiKeyResult.rows[0].value) {
      process.env.OPENAI_API_KEY = apiKeyResult.rows[0].value;
    }

    if (torConfig.enabled) {
      createSocksAgent();
    }

    console.log('🧅 TOR settings loaded:', {
      enabled: torConfig.enabled,
      host: torConfig.host,
      port: torConfig.port,
      exitCountry: torConfig.exitCountry,
    });
  } catch (error) {
    console.error('Error loading TOR settings:', error);
  }
}

/**
 * Create SOCKS proxy agent
 */
function createSocksAgent() {
  const proxyUrl = `socks5://${torConfig.host}:${torConfig.port}`;
  socksAgent = new SocksProxyAgent(proxyUrl);
  console.log(`🧅 SOCKS5 agent created: ${proxyUrl}`);
}

/**
 * Update TOR configuration
 */
export async function updateTorSettings(settings) {
  torConfig = {
    ...torConfig,
    ...settings,
  };

  if (torConfig.enabled) {
    createSocksAgent();
  } else {
    socksAgent = null;
  }

  console.log('🧅 TOR settings updated:', torConfig);

  // Refresh OpenAI client to use new settings
  try {
    const { refreshOpenAIClient } = await import('./openai.mjs');
    refreshOpenAIClient();
  } catch (error) {
    console.error('Error refreshing OpenAI client:', error);
  }
}

/**
 * Get current TOR configuration
 */
export function getTorConfig() {
  return { ...torConfig };
}

/**
 * Get HTTP agent for requests (returns TOR agent if enabled)
 */
export function getHttpAgent() {
  if (torConfig.enabled && socksAgent) {
    return socksAgent;
  }
  return undefined;
}

/**
 * Check if TOR is enabled
 */
export function isTorEnabled() {
  return torConfig.enabled;
}

/**
 * Test TOR connection by checking IP
 */
export async function testTorConnection(host = torConfig.host, port = torConfig.port) {
  return new Promise((resolve) => {
    try {
      const proxyUrl = `socks5://${host}:${port}`;
      const agent = new SocksProxyAgent(proxyUrl);

      // Use httpbin or similar service to check IP
      const options = {
        hostname: 'api.ipify.org',
        port: 443,
        path: '/?format=json',
        method: 'GET',
        agent,
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            // Now get country info
            getCountryFromIP(result.ip, agent)
              .then(country => {
                resolve({
                  success: true,
                  ip: result.ip,
                  country: country || 'Unknown',
                });
              })
              .catch(() => {
                resolve({
                  success: true,
                  ip: result.ip,
                  country: 'Unknown',
                });
              });
          } catch (e) {
            resolve({
              success: true,
              ip: data.trim(),
              country: 'Unknown',
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('TOR test error:', error.message);
        resolve({
          success: false,
          error: `Не удалось подключиться к TOR: ${error.message}`,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Таймаут подключения к TOR',
        });
      });

      req.end();
    } catch (error) {
      resolve({
        success: false,
        error: `Ошибка создания подключения: ${error.message}`,
      });
    }
  });
}

/**
 * Get country from IP address
 */
async function getCountryFromIP(ip, agent) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'ipapi.co',
      port: 443,
      path: `/${ip}/country_name/`,
      method: 'GET',
      agent,
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data.trim());
      });
    });

    req.on('error', () => {
      resolve('Unknown');
    });

    req.on('timeout', () => {
      req.destroy();
      resolve('Unknown');
    });

    req.end();
  });
}

/**
 * Test OpenAI connection (with or without TOR)
 */
export async function testOpenAIConnection() {
  return new Promise((resolve) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey || apiKey === 'missing-key') {
        resolve({
          success: false,
          error: 'API ключ OpenAI не настроен',
        });
        return;
      }

      const agent = getHttpAgent();
      
      const postData = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
        max_tokens: 5,
      });

      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        agent,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            
            if (res.statusCode === 200) {
              resolve({
                success: true,
                model: result.model || 'gpt-4o-mini',
              });
            } else if (result.error) {
              resolve({
                success: false,
                error: result.error.message || 'Ошибка OpenAI API',
              });
            } else {
              resolve({
                success: false,
                error: `HTTP ${res.statusCode}: ${data}`,
              });
            }
          } catch (e) {
            resolve({
              success: false,
              error: `Ошибка парсинга ответа: ${data}`,
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('OpenAI test error:', error.message);
        resolve({
          success: false,
          error: `Ошибка подключения: ${error.message}`,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Таймаут подключения к OpenAI',
        });
      });

      req.write(postData);
      req.end();
    } catch (error) {
      resolve({
        success: false,
        error: `Ошибка: ${error.message}`,
      });
    }
  });
}

/**
 * Create fetch options with TOR agent if enabled
 */
export function getFetchOptions() {
  const agent = getHttpAgent();
  if (agent) {
    return {
      agent,
    };
  }
  return {};
}

export default {
  initTorSettings,
  updateTorSettings,
  getTorConfig,
  getHttpAgent,
  isTorEnabled,
  testTorConnection,
  testOpenAIConnection,
  getFetchOptions,
};

