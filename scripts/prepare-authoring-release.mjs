/** LMS-104: Course Authoring & Secure Delivery: operator-review fixture only, NOT a signed release. */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "authoring-release");
const source = path.join(root, "dist", "extension", "course-admin.mjs");
const html = path.join(root, "assets", "courses.html");
const studentHtml = path.join(root, "assets", "student.html");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const bytes = await readFile(source);
if (!bytes.length || bytes.length > 8 * 1024 * 1024 ||
    /^\s*(?:import\s+(?!type\b)|export\s+\*\s+from\s+)/m.test(bytes.toString("utf8"))) {
  throw new Error("Invalid or non-self-contained authoring module");
}
const document = await readFile(html);
if (!document.length || document.length > 256 * 1024) {
  throw new Error("Invalid or unbounded Admin HTML");
}
const studentDoc = await readFile(studentHtml);
if (!studentDoc.length || studentDoc.length > 256 * 1024) {
  throw new Error("Invalid or unbounded Student HTML");
}
const manifest = {
  id: "vibress-lms-authoring",
  name: "Vibress LMS — Course Authoring & Delivery",
  version: "0.1.0-dev.0",
  vibressApiVersion: "1.0.0",
  description: "Bilingual course authoring, public catalog, and secure Member lesson delivery",
  entrypoint: "vibress-lms-authoring.mjs",
  capabilities: [
    "extension.routes.admin", "extension.storage.read",
    "extension.storage.write", "admin.navigation",
    "extension.routes.public", "extension.routes.member",
    "extension.member_storage.read", "extension.member_storage.write",
  ],
  hooks: [],
  settingsSchema: {},
};
const coursesColumns = [
  { name: "status", type: "text", required: true },
  ...[
    "title_en", "title_ar", "summary_en", "summary_ar",
    "lesson_title_en", "lesson_title_ar", "lesson_body_en", "lesson_body_ar",
  ].map((name) => ({ name, type: "text", required: true })),
];
const enrollmentsColumns = [
  { name: "course_key", type: "text", required: true },
  { name: "state", type: "text", required: true },
];
const completionsColumns = [
  { name: "course_key", type: "text", required: true },
  { name: "lesson_key", type: "text", required: true },
  { name: "completed_at", type: "timestamptz", required: true },
];
const models = [
  { key: "courses", columns: coursesColumns, schemaSha256: sha256(JSON.stringify(coursesColumns)), indexedTextFields: ["status"] },
  { key: "enrollments", columns: enrollmentsColumns, schemaSha256: sha256(JSON.stringify(enrollmentsColumns)) },
  { key: "completions", columns: completionsColumns, schemaSha256: sha256(JSON.stringify(completionsColumns)) },
];
const artifactSha256 = sha256(bytes);
const plan = {
  manifestId: manifest.id,
  migrationId: "0001_lms_authoring",
  packageVersion: manifest.version,
  artifactSha256,
  migrationSha256: sha256(JSON.stringify(models.map((item) => ({
    key: item.key, schemaSha256: item.schemaSha256,
  })))),
  models,
};
const lockfile = {
  schemaVersion: 1,
  plugins: [{
    manifest, sha256: artifactSha256, storageModels: models,
    // Public/Member routes only need publication-scoped course reads.
    // Enrollment and completion use the separate Member-owned storage API.
    publicReadModels: ["courses"],
    memberReadModels: ["courses"],
    adminUiAssets: [{
      viewId: "courses", path: "courses.html", sha256: sha256(document),
    }],
  }],
};
await mkdir(output, { recursive: true });
await copyFile(source, path.join(output, manifest.entrypoint));
await copyFile(html, path.join(output, "courses.html"));
await copyFile(studentHtml, path.join(output, "student.html"));
await writeFile(path.join(output, "trusted-plugins.json"), JSON.stringify(lockfile, null, 2) + "\n");
await writeFile(path.join(output, "operator-migration-plan.json"), JSON.stringify(plan, null, 2) + "\n");
console.log("Prepared UNSIGNED, uninstalled LMS authoring & delivery review fixture:", output);
