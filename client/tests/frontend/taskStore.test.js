import { describe, it, expect } from 'vitest';
import { TASK_STATUSES, TASK_PRIORITIES } from '../../src/store/taskStore';

describe('TASK_STATUSES', () => {
  it('contains all required statuses', () => {
    const expectedKeys = ['pending', 'in_progress', 'review', 'revision', 'completed', 'cancelled', 'escalated'];
    expect(Object.keys(TASK_STATUSES)).toEqual(expectedKeys);
  });

  it('each status has id, name, color and icon', () => {
    for (const [key, status] of Object.entries(TASK_STATUSES)) {
      expect(status).toHaveProperty('id', key);
      expect(status).toHaveProperty('name');
      expect(status).toHaveProperty('color');
      expect(status).toHaveProperty('icon');
      expect(status.name).toBeTruthy();
      expect(status.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('TASK_PRIORITIES', () => {
  it('contains all required priorities', () => {
    const expectedKeys = ['low', 'medium', 'high', 'critical'];
    expect(Object.keys(TASK_PRIORITIES)).toEqual(expectedKeys);
  });

  it('each priority has id, name, color and icon', () => {
    for (const [key, priority] of Object.entries(TASK_PRIORITIES)) {
      expect(priority).toHaveProperty('id', key);
      expect(priority).toHaveProperty('name');
      expect(priority).toHaveProperty('color');
      expect(priority).toHaveProperty('icon');
    }
  });

  it('critical priority is red', () => {
    expect(TASK_PRIORITIES.critical.color).toBe('#ef4444');
  });
});
