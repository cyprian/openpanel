import type { StatsFs } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDiskUsage } from './disk-usage';

vi.mock('node:fs/promises', () => ({ statfs: vi.fn() }));

function mockStats(overrides: Partial<StatsFs> = {}) {
  vi.mocked(statfs).mockResolvedValue({
    type: 0,
    bsize: 4096,
    blocks: 1000,
    bfree: 400,
    bavail: 400,
    files: 0,
    ffree: 0,
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('getDiskUsage', () => {
  it('reads the API filesystem by default, including on macOS', async () => {
    vi.stubEnv('DISK_USAGE_PATH', '');
    mockStats();
    expect(await getDiskUsage()).toEqual({
      totalBytes: 4_096_000,
      usedBytes: 2_457_600,
      availableBytes: 1_638_400,
      usedPercent: 60,
    });
    expect(statfs).toHaveBeenCalledWith(process.cwd());
  });

  it('uses the configured mount and excludes Linux reserved blocks from available space', async () => {
    vi.stubEnv('DISK_USAGE_PATH', '/data');
    mockStats({ bavail: 300 });
    const usage = await getDiskUsage();
    expect(statfs).toHaveBeenCalledWith('/data');
    expect(usage.availableBytes).toBe(1_228_800);
    expect(usage.usedPercent).toBe(70);
    expect(usage.usedBytes + usage.availableBytes).toBe(usage.totalBytes);
  });

  it.each([-10, 0, 1000, 1100])('bounds available blocks at %s', async (bavail) => {
    mockStats({ bavail });
    const usage = await getDiskUsage();
    expect(usage.usedPercent).toBeGreaterThanOrEqual(0);
    expect(usage.usedPercent).toBeLessThanOrEqual(100);
    expect(usage.usedBytes + usage.availableBytes).toBe(usage.totalBytes);
  });

  it('rejects unavailable capacity rather than reporting an empty disk', async () => {
    mockStats({ blocks: 0 });
    await expect(getDiskUsage()).rejects.toThrow('Disk capacity is unavailable');
  });

  it('propagates filesystem failures for the UI unavailable state', async () => {
    vi.mocked(statfs).mockRejectedValue(new Error('Permission denied'));
    await expect(getDiskUsage()).rejects.toThrow('Permission denied');
  });
});
