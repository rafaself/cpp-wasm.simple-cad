import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');
const outputPath = path.join(distDir, 'bundle-report.json');

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

const collectFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }
    return [fullPath];
  });
};

const buildReport = () => {
  if (!fs.existsSync(assetsDir)) {
    // eslint-disable-next-line no-console
    console.error(`Missing ${assetsDir}. Run "pnpm build" first.`);
    process.exit(1);
  }

  const files = collectFiles(assetsDir);
  const entries = files.map((file) => {
    const content = fs.readFileSync(file);
    const gzip = gzipSync(content);
    const brotli = brotliCompressSync(content);
    return {
      file: path.relative(distDir, file),
      bytes: content.byteLength,
      gzipBytes: gzip.byteLength,
      brotliBytes: brotli.byteLength,
    };
  });

  entries.sort((a, b) => b.bytes - a.bytes);

  const totals = entries.reduce(
    (acc, entry) => {
      acc.bytes += entry.bytes;
      acc.gzipBytes += entry.gzipBytes;
      acc.brotliBytes += entry.brotliBytes;
      return acc;
    },
    { bytes: 0, gzipBytes: 0, brotliBytes: 0 },
  );

  const report = {
    generatedAt: new Date().toISOString(),
    totals,
    entries,
    top10: entries.slice(0, 10),
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  // eslint-disable-next-line no-console
  console.log('Bundle report written to', outputPath);
  // eslint-disable-next-line no-console
  console.table(
    report.top10.map((entry) => ({
      file: entry.file,
      size: formatBytes(entry.bytes),
      gzip: formatBytes(entry.gzipBytes),
      brotli: formatBytes(entry.brotliBytes),
    })),
  );
};

buildReport();
