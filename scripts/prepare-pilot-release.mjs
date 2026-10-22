/** Prepare an UNAPPROVED operator review fixture; never signs or installs it. */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist', 'pilot-release');
const input = path.join(root, 'dist', 'extension', 'pilot.mjs');
const artifactName = 'vibress-lms-pilot.mjs';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const bytes = await readFile(input);
if (bytes.length > 8 * 1024 * 1024 || bytes.length === 0) {
  throw new Error('Invalid/beyond-limit LMS artifact');
}
// A single verified bundle is essential because the Host imports pinned bytes
// via data URL. Node import specifiers are not resolvable from that URL.
if (/^\s*(?:import\s+(?!type\b)|export\s+\*\s+from\s+)/m.test(bytes.toString('utf8'))) {
  throw new Error('The pilot artifact must be self-contained');
}
const manifest = {
  id: 'vibress-lms-pilot',
  name: 'Vibress LMS — Free Course Pilot',
  version: '0.1.0-dev.0',
  vibressApiVersion: '1.0.0',
  description: 'Operator-reviewed free-course Member storage integration pilot',
  entrypoint: artifactName,
  capabilities: [
    'extension.routes.public', 'extension.routes.member',
    'extension.member_storage.read', 'extension.member_storage.write',
  ],
  hooks: [],
  settingsSchema: {},
};
const declarations = [
  { key: 'enrollments', columns: [
    { name: 'course_key', type: 'text', required: true },
    { name: 'state', type: 'text', required: true },
  ] },
  { key: 'completions', columns: [
    { name: 'course_key', type: 'text', required: true },
    { name: 'lesson_key', type: 'text', required: true },
    { name: 'completed_at', type: 'timestamptz', required: true },
  ] },
];
const models = declarations.map(({ key, columns }) => ({
  key, columns, schemaSha256: sha256(JSON.stringify(columns)),
}));
const artifactSha256 = sha256(bytes);
const migrationPlan = {
  manifestId: manifest.id,
  migrationId: '0001_lms_pilot',
  packageVersion: manifest.version,
  artifactSha256,
  migrationSha256: sha256(JSON.stringify(models.map((m) => ({
    key: m.key, schemaSha256: m.schemaSha256,
  })))),
  models,
};
const lockfile = { schemaVersion: 1,
  plugins: [{ manifest, sha256: artifactSha256, storageModels: models }],
};
await mkdir(output, { recursive: true });
await copyFile(input, path.join(output, artifactName));
await writeFile(path.join(output, 'trusted-plugins.json'), JSON.stringify(lockfile, null, 2) + '\n');
await writeFile(path.join(output, 'operator-migration-plan.json'),
  JSON.stringify(migrationPlan, null, 2) + '\n');
console.log(`Prepared unsigned, uninstalled operator review fixture: ${output}`);
