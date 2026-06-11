import pool from '../db.mjs';
import crypto from 'crypto';

// Шифрование для хранения session strings
const ENCRYPTION_KEY = process.env.PLUGIN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  if (!text) return null;
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = parts.join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function savePluginConfig({
  userId,
  projectId,
  elementId,
  pluginId,
  enabled,
  config,
  sessionString
}) {
  const encryptedSession = sessionString ? encrypt(sessionString) : null;

  const result = await pool.query(`
    INSERT INTO plugin_configs (
      user_id, project_id, element_id, plugin_id, enabled, config, encrypted_session, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, project_id, element_id)
    DO UPDATE SET
      plugin_id = EXCLUDED.plugin_id,
      enabled = EXCLUDED.enabled,
      config = EXCLUDED.config,
      encrypted_session = EXCLUDED.encrypted_session,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, user_id, project_id, element_id, plugin_id, enabled, config, connection_status, last_tested_at, last_error, created_at, updated_at
  `, [userId, projectId, elementId, pluginId, enabled, JSON.stringify(config), encryptedSession]);

  return result.rows[0];
}

export async function getPluginConfig({ userId, projectId, elementId }) {
  const result = await pool.query(`
    SELECT id, user_id, project_id, element_id, plugin_id, enabled, config, encrypted_session,
           connection_status, last_tested_at, last_error, created_at, updated_at
    FROM plugin_configs
    WHERE user_id = $1 AND project_id = $2 AND element_id = $3
  `, [userId, projectId, elementId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...row,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
    sessionString: row.encrypted_session ? decrypt(row.encrypted_session) : null
  };
}

export async function getAllEnabledConfigs() {
  const result = await pool.query(`
    SELECT id, user_id, project_id, element_id, plugin_id, enabled, config, encrypted_session,
           connection_status, last_tested_at, last_error
    FROM plugin_configs
    WHERE enabled = true
  `);

  return result.rows.map(row => ({
    ...row,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
    sessionString: row.encrypted_session ? decrypt(row.encrypted_session) : null
  }));
}

export async function updateConnectionStatus({ userId, projectId, elementId, status, error }) {
  await pool.query(`
    UPDATE plugin_configs
    SET connection_status = $1,
        last_tested_at = CURRENT_TIMESTAMP,
        last_error = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $3 AND project_id = $4 AND element_id = $5
  `, [status, error || null, userId, projectId, elementId]);
}

export async function deletePluginConfig({ userId, projectId, elementId }) {
  await pool.query(`
    DELETE FROM plugin_configs
    WHERE user_id = $1 AND project_id = $2 AND element_id = $3
  `, [userId, projectId, elementId]);
}
