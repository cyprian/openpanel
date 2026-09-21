import { statfs } from 'node:fs/promises';

export async function getDiskUsage() {
  // Query the filesystem containing this path, using the same API on macOS
  // and Linux. An API container can point this at a mounted data volume.
  const stats = await statfs(process.env.DISK_USAGE_PATH || process.cwd());
  const totalBytes = stats.blocks * stats.bsize;
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    throw new Error('Disk capacity is unavailable');
  }

  // bavail excludes Linux blocks reserved for root. Count those as used so
  // the remaining segment represents space the application can actually use.
  const availableBytes = Math.min(
    totalBytes,
    Math.max(0, stats.bavail * stats.bsize),
  );
  const usedBytes = totalBytes - availableBytes;

  return {
    totalBytes,
    usedBytes,
    availableBytes,
    usedPercent: (usedBytes / totalBytes) * 100,
  };
}
