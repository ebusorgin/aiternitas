import { manifest as telegram } from './telegramMTProto.mjs';

// Registry for plugins. Add new plugins here as the folder grows.
const PLUGINS = [telegram];

function sanitizeManifest(p) {
  // Keep only JSON-serializable data used by the frontend.
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    howItWorks: p.howItWorks,
    fields: Array.isArray(p.fields) ? p.fields : [],
    instructions: p.instructions ?? null
  };
}

export function listPluginManifests() {
  return PLUGINS.map(sanitizeManifest);
}

export function getPluginManifest(pluginId) {
  const p = PLUGINS.find(x => x.id === pluginId);
  return p ? sanitizeManifest(p) : null;
}
