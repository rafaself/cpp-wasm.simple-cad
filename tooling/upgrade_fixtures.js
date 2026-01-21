#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const MAGIC_ESNP = 0x504e5345; // "ESNP"
const HEADER_BYTES = 16;
const SECTION_ENTRY_BYTES = 16;

const TAG_ENTS = fourCC('E', 'N', 'T', 'S');
const TAG_TEXT = fourCC('T', 'E', 'X', 'T');

const RECT_BYTES_V3 = 12 + 17 * 4;
const LINE_BYTES_V3 = 12 + 10 * 4;
const POLY_BYTES_V3 = 20 + 11 * 4;
const CIRCLE_BYTES_V3 = 12 + 17 * 4;
const POLYGON_BYTES_V3 = 12 + 17 * 4 + 4;
const ARROW_BYTES_V3 = 12 + 11 * 4;
const TEXT_HEADER_BYTES_V3 = 64;
const TEXT_RUN_BYTES = 24;
const POINT_BYTES = 8;
const ENTS_HEADER_BYTES = 7 * 4;
const TEXT_RUN_COUNT_OFFSET_V3 = 32;
const TEXT_CONTENT_LENGTH_OFFSET_V3 = 36;

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.pnpm', 'dist', 'build', 'out', '.turbo']);

function fourCC(a, b, c, d) {
  return (
    a.charCodeAt(0) |
    (b.charCodeAt(0) << 8) |
    (c.charCodeAt(0) << 16) |
    (d.charCodeAt(0) << 24)
  ) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readU32LE(buf, offset) {
  return buf.readUInt32LE(offset);
}

function writeU32LE(buf, offset, value) {
  buf.writeUInt32LE(value >>> 0, offset);
}

function requireBytes(offset, size, total, label) {
  if (offset + size > total) {
    throw new Error(`Buffer truncated while reading ${label || 'section'}.`);
  }
}

function checkedMul(a, b) {
  const out = a * b;
  if (!Number.isSafeInteger(out)) {
    throw new Error('Size overflow while computing section length.');
  }
  return out;
}

function normalizePattern(pattern) {
  return pattern.replace(/\\/g, '/').replace(/^\.\//, '');
}

function hasWildcard(pattern) {
  return /[*?]/.test(pattern);
}

function globToRegex(pattern) {
  let out = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 3;
          continue;
        }
        out += '.*';
        i += 2;
        continue;
      }
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if ('\\.[]{}()+-^$|'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
    i += 1;
  }
  out += '$';
  return new RegExp(out);
}

function walkFiles(root, out) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkFiles(fullPath, out);
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
}

function collectFiles(patterns) {
  const results = new Set();
  const missingExplicit = [];

  const normalized = patterns.map(normalizePattern);
  const explicit = normalized.filter((pattern) => !hasWildcard(pattern));
  const wildcard = normalized.filter(hasWildcard);

  for (const pattern of explicit) {
    const abs = path.isAbsolute(pattern) ? pattern : path.join(repoRoot, pattern);
    if (!fs.existsSync(abs)) {
      missingExplicit.push(pattern);
      continue;
    }
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      results.add(abs);
    }
  }

  if (wildcard.length > 0) {
    const files = [];
    walkFiles(repoRoot, files);
    const regexes = wildcard.map((pattern) => globToRegex(pattern));
    for (const file of files) {
      const rel = normalizePattern(path.relative(repoRoot, file));
      for (const regex of regexes) {
        if (regex.test(rel)) {
          results.add(file);
          break;
        }
      }
    }
  }

  if (missingExplicit.length > 0) {
    throw new Error(`Missing explicit paths: ${missingExplicit.join(', ')}`);
  }

  return [...results];
}

function parseSections(buf) {
  if (buf.length < HEADER_BYTES) {
    throw new Error('Snapshot buffer too small for header.');
  }
  const magic = readU32LE(buf, 0);
  if (magic !== MAGIC_ESNP) {
    throw new Error('Invalid ESNP magic.');
  }
  const sectionCount = readU32LE(buf, 8);
  const tableBytes = checkedMul(sectionCount, SECTION_ENTRY_BYTES);
  const headerPlusTable = HEADER_BYTES + tableBytes;
  if (buf.length < headerPlusTable) {
    throw new Error('Snapshot buffer too small for section table.');
  }
  const sections = [];
  for (let i = 0; i < sectionCount; i += 1) {
    const base = HEADER_BYTES + i * SECTION_ENTRY_BYTES;
    const tag = readU32LE(buf, base);
    const offset = readU32LE(buf, base + 4);
    const size = readU32LE(buf, base + 8);
    const expectedCrc = readU32LE(buf, base + 12);
    if (offset < headerPlusTable) {
      throw new Error('Section offset overlaps header/table.');
    }
    requireBytes(offset, size, buf.length, 'section');
    const payload = buf.slice(offset, offset + size);
    const actualCrc = crc32(payload);
    if (actualCrc !== expectedCrc) {
      throw new Error(`CRC mismatch for section tag ${tag.toString(16)}.`);
    }
    sections.push({ tag, bytes: Buffer.from(payload) });
  }
  return sections;
}

function upgradeEntsSection(buf) {
  let o = 0;
  requireBytes(o, ENTS_HEADER_BYTES, buf.length, 'ENTS header');
  const rectCount = readU32LE(buf, o + 0);
  const lineCount = readU32LE(buf, o + 4);
  const polyCount = readU32LE(buf, o + 8);
  const pointCount = readU32LE(buf, o + 12);
  const circleCount = readU32LE(buf, o + 16);
  const polygonCount = readU32LE(buf, o + 20);
  const arrowCount = readU32LE(buf, o + 24);
  o += ENTS_HEADER_BYTES;

  const zeroF32 = Buffer.alloc(4);
  const chunks = [buf.slice(0, ENTS_HEADER_BYTES)];
  let totalBytes = ENTS_HEADER_BYTES;

  const pushRecords = (count, recordBytes, label) => {
    for (let i = 0; i < count; i += 1) {
      requireBytes(o, recordBytes, buf.length, label);
      chunks.push(buf.slice(o, o + recordBytes));
      chunks.push(zeroF32);
      totalBytes += recordBytes + 4;
      o += recordBytes;
    }
  };

  pushRecords(rectCount, RECT_BYTES_V3, 'rect record');
  pushRecords(lineCount, LINE_BYTES_V3, 'line record');
  pushRecords(polyCount, POLY_BYTES_V3, 'polyline record');

  const pointsBytes = checkedMul(pointCount, POINT_BYTES);
  requireBytes(o, pointsBytes, buf.length, 'points');
  if (pointsBytes > 0) {
    chunks.push(buf.slice(o, o + pointsBytes));
    totalBytes += pointsBytes;
    o += pointsBytes;
  }

  pushRecords(circleCount, CIRCLE_BYTES_V3, 'circle record');
  pushRecords(polygonCount, POLYGON_BYTES_V3, 'polygon record');
  pushRecords(arrowCount, ARROW_BYTES_V3, 'arrow record');

  if (o !== buf.length) {
    throw new Error('ENTS section size mismatch.');
  }

  return Buffer.concat(chunks, totalBytes);
}

function upgradeTextSection(buf) {
  let o = 0;
  requireBytes(o, 4, buf.length, 'TEXT count');
  const count = readU32LE(buf, o);
  o += 4;

  const zeroF32 = Buffer.alloc(4);
  const chunks = [buf.slice(0, 4)];
  let totalBytes = 4;

  for (let i = 0; i < count; i += 1) {
    requireBytes(o, TEXT_HEADER_BYTES_V3, buf.length, 'TEXT header');
    const runCount = readU32LE(buf, o + TEXT_RUN_COUNT_OFFSET_V3);
    const contentLength = readU32LE(buf, o + TEXT_CONTENT_LENGTH_OFFSET_V3);

    const header = buf.slice(o, o + TEXT_HEADER_BYTES_V3);
    o += TEXT_HEADER_BYTES_V3;

    const runBytes = checkedMul(runCount, TEXT_RUN_BYTES);
    requireBytes(o, runBytes, buf.length, 'TEXT runs');
    const runs = buf.slice(o, o + runBytes);
    o += runBytes;

    requireBytes(o, contentLength, buf.length, 'TEXT content');
    const content = buf.slice(o, o + contentLength);
    o += contentLength;

    chunks.push(header, zeroF32, runs, content);
    totalBytes += TEXT_HEADER_BYTES_V3 + 4 + runBytes + contentLength;
  }

  if (o !== buf.length) {
    throw new Error('TEXT section size mismatch.');
  }

  return Buffer.concat(chunks, totalBytes);
}

function buildSnapshotBytes(version, sections) {
  const tableBytes = sections.length * SECTION_ENTRY_BYTES;
  let payloadBytes = 0;
  for (const sec of sections) payloadBytes += sec.bytes.length;
  const totalBytes = HEADER_BYTES + tableBytes + payloadBytes;

  const out = Buffer.alloc(totalBytes);
  writeU32LE(out, 0, MAGIC_ESNP);
  writeU32LE(out, 4, version);
  writeU32LE(out, 8, sections.length);
  writeU32LE(out, 12, 0);

  let tableOffset = HEADER_BYTES;
  let dataOffset = HEADER_BYTES + tableBytes;
  for (const sec of sections) {
    writeU32LE(out, tableOffset + 0, sec.tag);
    writeU32LE(out, tableOffset + 4, dataOffset);
    writeU32LE(out, tableOffset + 8, sec.bytes.length);
    writeU32LE(out, tableOffset + 12, crc32(sec.bytes));
    sec.bytes.copy(out, dataOffset);
    tableOffset += SECTION_ENTRY_BYTES;
    dataOffset += sec.bytes.length;
  }

  return out;
}

function upgradeSnapshotBytes(buf, toVersion) {
  if (buf.length < HEADER_BYTES) {
    throw new Error('Snapshot buffer too small.');
  }
  const magic = readU32LE(buf, 0);
  if (magic !== MAGIC_ESNP) {
    throw new Error('Invalid ESNP magic.');
  }
  const version = readU32LE(buf, 4);
  if (version !== 3) {
    return { status: 'skipped', reason: `version ${version}` };
  }

  const sections = parseSections(buf);
  const upgraded = sections.map((section) => {
    if (section.tag === TAG_ENTS) {
      return { tag: section.tag, bytes: upgradeEntsSection(section.bytes) };
    }
    if (section.tag === TAG_TEXT) {
      return { tag: section.tag, bytes: upgradeTextSection(section.bytes) };
    }
    return section;
  });

  const out = buildSnapshotBytes(toVersion, upgraded);
  return { status: 'upgraded', bytes: out };
}

function main() {
  const args = process.argv.slice(2);
  let toVersion = null;
  let outDir = null;
  const patterns = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--to-version') {
      const next = args[i + 1];
      if (!next) {
        console.error('Missing value for --to-version.');
        process.exit(1);
      }
      toVersion = Number.parseInt(next, 10);
      i += 1;
      continue;
    }
    if (arg === '--out-dir') {
      const next = args[i + 1];
      if (!next) {
        console.error('Missing value for --out-dir.');
        process.exit(1);
      }
      outDir = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
    patterns.push(arg);
  }

  if (toVersion === null) {
    console.error('Missing required --to-version argument.');
    process.exit(1);
  }
  if (toVersion !== 4) {
    console.error(`Unsupported target version ${toVersion}. Only v4 is supported.`);
    process.exit(1);
  }

  const targets = collectFiles(patterns.length > 0 ? patterns : ['**/*.esnp']);
  if (targets.length === 0) {
    console.log('No matching ESNP fixtures found.');
    return;
  }

  let upgraded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of targets) {
    try {
      const buf = fs.readFileSync(file);
      const result = upgradeSnapshotBytes(buf, toVersion);
      if (result.status === 'skipped') {
        skipped += 1;
        continue;
      }
      const outPath = outDir ? path.join(outDir, path.relative(repoRoot, file)) : file;
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, result.bytes);
      upgraded += 1;
    } catch (err) {
      failed += 1;
      console.error(`Failed to upgrade ${path.relative(repoRoot, file)}: ${err.message}`);
    }
  }

  console.log(`Upgrade complete. upgraded=${upgraded} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main();
