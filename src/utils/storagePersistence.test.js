import { describe, it, expect } from 'vitest';
import { formatBytes, ensurePersistentStorage, getStorageEstimate } from './storagePersistence.js';

describe('formatBytes', () => {
  it('formats byte-range values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats kilobytes with one decimal under 10', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
  it('drops the decimal at or above 10 units', () => {
    expect(formatBytes(10 * 1024)).toBe('10 KB');
  });
  it('scales up to MB and GB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
  it('handles nullish input safely', () => {
    expect(formatBytes(undefined)).toBe('0 B');
    expect(formatBytes(null)).toBe('0 B');
  });
});

describe('storage APIs without the Storage API available', () => {
  // In a plain node environment navigator.storage is absent; the helpers must
  // degrade gracefully rather than throw.
  it('ensurePersistentStorage reports unsupported instead of throwing', async () => {
    await expect(ensurePersistentStorage()).resolves.toEqual({ supported: false, persisted: false });
  });
  it('getStorageEstimate returns null when unavailable', async () => {
    await expect(getStorageEstimate()).resolves.toBeNull();
  });
});
