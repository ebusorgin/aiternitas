// Settings API routes
import express from 'express';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { testTorConnection, testOpenAIConnection, updateTorSettings } from '../services/tor.mjs';

const router = express.Router();

// Get current settings
router.get('/', requireAuth, async (req, res) => {
  try {
    // Get settings from database (global settings for now, can be per-user later)
    const result = await pool.query(
      'SELECT key, value FROM app_settings WHERE key IN ($1, $2, $3, $4, $5)',
      ['tor_enabled', 'tor_exit_country', 'openai_api_key', 'tor_host', 'tor_port']
    );

    const settings = {
      torEnabled: false,
      torExitCountry: 'US',
      openaiApiKey: '',
      torHost: '127.0.0.1',
      torPort: 9050,
    };

    result.rows.forEach(row => {
      switch (row.key) {
        case 'tor_enabled':
          settings.torEnabled = row.value === 'true';
          break;
        case 'tor_exit_country':
          settings.torExitCountry = row.value;
          break;
        case 'openai_api_key':
          // Mask the API key for security
          settings.openaiApiKey = row.value ? '••••••••' + row.value.slice(-4) : '';
          break;
        case 'tor_host':
          settings.torHost = row.value;
          break;
        case 'tor_port':
          settings.torPort = parseInt(row.value) || 9050;
          break;
      }
    });

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения настроек' });
  }
});

// Update settings
router.put('/', requireAuth, async (req, res) => {
  try {
    const { torEnabled, torExitCountry, openaiApiKey, torHost, torPort } = req.body;

    // Prepare upsert queries
    const upsertSetting = async (key, value) => {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    };

    // Update each setting
    await upsertSetting('tor_enabled', torEnabled ? 'true' : 'false');
    await upsertSetting('tor_exit_country', torExitCountry || 'US');
    await upsertSetting('tor_host', torHost || '127.0.0.1');
    await upsertSetting('tor_port', String(torPort || 9050));

    // Only update API key if it's not masked
    if (openaiApiKey && !openaiApiKey.startsWith('••••')) {
      await upsertSetting('openai_api_key', openaiApiKey);
      // Also update environment variable for current session
      process.env.OPENAI_API_KEY = openaiApiKey;
    }

    // Update TOR settings in the service
    await updateTorSettings({
      enabled: torEnabled,
      exitCountry: torExitCountry,
      host: torHost,
      port: torPort,
    });

    console.log('✅ Settings updated:', { torEnabled, torExitCountry, torHost, torPort });

    res.json({ success: true, message: 'Настройки сохранены' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, error: 'Ошибка сохранения настроек' });
  }
});

// Test TOR connection
router.post('/test-tor', requireAuth, async (req, res) => {
  try {
    const { torHost, torPort, exitCountry } = req.body;
    
    const result = await testTorConnection(torHost, torPort, exitCountry);
    
    if (result.success) {
      res.json({
        success: true,
        ip: result.ip,
        country: result.country,
      });
    } else {
      res.json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error testing TOR:', error);
    res.json({
      success: false,
      error: error.message || 'Ошибка тестирования TOR',
    });
  }
});

// Test OpenAI connection
router.post('/test-openai', requireAuth, async (req, res) => {
  try {
    const result = await testOpenAIConnection();
    
    if (result.success) {
      res.json({
        success: true,
        model: result.model,
      });
    } else {
      res.json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error testing OpenAI:', error);
    res.json({
      success: false,
      error: error.message || 'Ошибка тестирования OpenAI',
    });
  }
});

export default router;

