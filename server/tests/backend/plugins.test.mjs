import { describe, it, expect } from 'vitest';
import { listPluginManifests, getPluginManifest } from '../../server/plugins/index.mjs';

describe('plugins registry', () => {
  it('lists telegram plugin manifest', () => {
    const plugins = listPluginManifests();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.some(p => p.id === 'telegram')).toBe(true);
  });

  it('telegram manifest has fields and instructions', () => {
    const p = getPluginManifest('telegram');
    expect(p).toBeTruthy();
    expect(p.id).toBe('telegram');
    expect(p.name).toBeTruthy();
    expect(Array.isArray(p.fields)).toBe(true);
    expect(p.fields.length).toBeGreaterThan(0);
    expect(p.instructions).toBeTruthy();
  });
});

