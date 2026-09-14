/**
 * Fail if the committed SBOM no longer matches the dependency tree.
 *
 * Regenerates a CycloneDX SBOM to a temporary file and compares it with the
 * committed `sbom.json`, ignoring the fields that change on every run
 * (`serialNumber`, `metadata.timestamp`, `metadata.tools`). A stale SBOM is a
 * compliance failure, not a warning — an SBOM nobody regenerates describes a
 * dependency tree that no longer exists.
 *
 * Usage: node build/sbom-check.js
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const COMMITTED = path.join(ROOT, 'sbom.json');

/** Strip fields that differ between two runs over an identical tree. */
function normalize(sbom) {
  const { serialNumber, metadata, ...rest } = sbom;
  const { timestamp, tools, ...metaRest } = metadata ?? {};
  void serialNumber;
  void timestamp;
  void tools;
  return JSON.stringify({ ...rest, metadata: metaRest }, null, 2);
}

if (!fs.existsSync(COMMITTED)) {
  console.error('sbom.json is missing. Run `npm run sbom` and commit the result.');
  process.exit(1);
}

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-')), 'sbom.json');

// Invoke the CLI's JS entry point directly rather than through npx: the .cmd
// shim needs a shell on Windows, and a shell here would mean quoting a path.
const cli = path.join(ROOT, 'node_modules', '@cyclonedx', 'cyclonedx-npm', 'bin', 'cyclonedx-npm-cli.js');

execFileSync(
  process.execPath,
  [cli, '--omit', 'dev', '--output-format', 'JSON', '--output-file', tmp],
  { cwd: ROOT, stdio: 'inherit' }
);

const committed = normalize(JSON.parse(fs.readFileSync(COMMITTED, 'utf-8')));
const current = normalize(JSON.parse(fs.readFileSync(tmp, 'utf-8')));

if (committed !== current) {
  console.error(
    'sbom.json is stale — it does not match the current dependency tree.\n' +
    'Run `npm run sbom` and commit the updated file.'
  );
  process.exit(1);
}

const count = JSON.parse(committed).components?.length ?? 0;
console.log(`SBOM is current (${count} runtime component${count === 1 ? '' : 's'}).`);
