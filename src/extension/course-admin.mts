/**
 * LMS-103: independently approved Staff course-authoring extension.
 * One bilingual required text lesson per course; deliberately NOT the
 * existing installed free-course Member pilot or a full curriculum builder.
 * No imports, direct SQL, caller-supplied publication IDs or public bodies.
 */
type Scalar = string | number | boolean;
type Value = Scalar | null;
type Fields = Readonly<Record<string, Value>>;
interface RecordItem { readonly id: string; readonly version: number; readonly fields: Fields }
interface Storage {
  get(model: string, id: string): Promise<RecordItem | null>;
  list(model: string, limit?: number, cursor?: string): Promise<{
    readonly items: readonly RecordItem[]; readonly nextCursor?: string;
  }>;
  create(model: string, id: string, fields: Fields): Promise<RecordItem>;
  update(model: string, id: string, expectedVersion: number, fields: Fields): Promise<RecordItem>;
}
interface Scope {
  readonly publicationId: string;
  readonly principal: { readonly kind: "staff" | "member" | "anonymous"; readonly id?: string };
  readonly storage?: Storage;
}
interface Input {
  readonly query: Readonly<Record<string, Scalar>>;
  readonly body: Readonly<Record<string, Scalar>>;
}
type Shape = { readonly fields: Record<string, "string" | "number">; readonly required?: readonly string[] };
interface Route {
  readonly id: string; readonly audience: "admin"; readonly method: "GET" | "POST";
  readonly permission: "plugins.manage";
  readonly body?: Shape; readonly response: Shape;
  readonly handle: (input: Input, scope: Scope) => Promise<Record<string, Scalar>>;
}
const MODEL = "courses";
const COURSE_ID = /^[a-z][a-z0-9-]{1,63}$/;
const MAX_TITLE = 180;
const MAX_SUMMARY = 1000;
const MAX_LESSON = 4096;

const fieldNames = [
  "title_en", "title_ar", "summary_en", "summary_ar",
  "lesson_title_en", "lesson_title_ar", "lesson_body_en", "lesson_body_ar",
] as const;
type FieldName = typeof fieldNames[number];
const limits: Readonly<Record<FieldName, number>> = {
  title_en: MAX_TITLE, title_ar: MAX_TITLE,
  summary_en: MAX_SUMMARY, summary_ar: MAX_SUMMARY,
  lesson_title_en: MAX_TITLE, lesson_title_ar: MAX_TITLE,
  lesson_body_en: MAX_LESSON, lesson_body_ar: MAX_LESSON,
};
function staffStorage(scope: Scope): Storage | null {
  return scope.publicationId && scope.principal.kind === "staff" && scope.principal.id
    ? scope.storage ?? null : null;
}
function courseId(value: Scalar | undefined): string | null {
  return typeof value === "string" && COURSE_ID.test(value) ? value : null;
}
function text(value: Scalar | undefined, limit: number): string | null {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) return null;
  return value.trim();
}
function requestedFields(body: Readonly<Record<string, Scalar>>): Fields | null {
  const fields: Record<string, Value> = {};
  for (const key of fieldNames) {
    const value = text(body[key], limits[key]);
    if (value === null) return null;
    fields[key] = value;
  }
  return fields;
}
function complete(fields: Fields): boolean {
  // Publishing an empty curriculum is forbidden; this release supports
  // exactly one bilingual, protected text lesson per authored course.
  return fieldNames.every((key) => {
    const value = fields[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}
function validStored(item: RecordItem, id: string): boolean {
  return item.id === id && Number.isSafeInteger(item.version) && item.version > 0 &&
    (item.fields.status === "draft" || item.fields.status === "published") &&
    fieldNames.every((key) => {
      const value = item.fields[key];
      return typeof value === "string" && value.length <= limits[key];
    });
}
function outcome(kind: string, id = "", version = 0, status = "") {
  return { outcome: kind, courseId: id, version, status };
}
function conflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error.code === "PLUGIN_STORAGE_CONFLICT" || error.code === "PLUGIN_STORAGE_VERSION_CONFLICT");
}

const route: Route[] = [
  {
    id: "courses", audience: "admin", method: "GET", permission: "plugins.manage",
    response: { fields: {
      outcome: "string", courseId: "string", status: "string", version: "number",
      title_en: "string", title_ar: "string", summary_en: "string", summary_ar: "string",
      lesson_title_en: "string", lesson_title_ar: "string",
      lesson_body_en: "string", lesson_body_ar: "string",
    }, required: [
      "outcome", "courseId", "status", "version",
      ...fieldNames,
    ] },
    async handle(_input, scope) {
      const storage = staffStorage(scope);
      if (!storage) return { ...outcome("unavailable"), ...Object.fromEntries(fieldNames.map((name) => [name, ""])) };
      const { items } = await storage.list(MODEL, 1);
      const first = items[0];
      if (!first) return { ...outcome("empty"), ...Object.fromEntries(fieldNames.map((name) => [name, ""])) };
      if (!validStored(first, first.id)) throw new Error("Inconsistent stored course");
      const values = Object.fromEntries(fieldNames.map((name) => [name, first.fields[name]]));
      return { ...outcome("available", first.id, first.version, String(first.fields.status)), ...values };
    },
  },
  {
    id: "courses", audience: "admin", method: "POST", permission: "plugins.manage",
    body: { fields: {
      operation: "string", courseId: "string", expectedVersion: "number",
      ...Object.fromEntries(fieldNames.map((name) => [name, "string" as const])),
    }, required: ["operation", "courseId", "expectedVersion", ...fieldNames] },
    response: { fields: {
      outcome: "string", courseId: "string", version: "number", status: "string",
    }, required: ["outcome", "courseId", "version", "status"] },
    async handle({ body }, scope) {
      const storage = staffStorage(scope);
      if (!storage) return outcome("unavailable");
      const id = courseId(body.courseId);
      const inputFields = requestedFields(body);
      const version = body.expectedVersion;
      const operation = body.operation;
      if (!id || !inputFields || typeof version !== "number" ||
          !Number.isSafeInteger(version) || version < 0 ||
          !["create", "save", "publish"].includes(String(operation))) {
        return outcome("invalid");
      }
      if (operation === "create") {
        if (version !== 0) return outcome("conflict", id);
        try {
          const record = await storage.create(MODEL, id, { ...inputFields, status: "draft" });
          return outcome("created", id, record.version, "draft");
        } catch (error) {
          if (conflict(error)) return outcome("conflict", id);
          throw error;
        }
      }
      const existing = await storage.get(MODEL, id);
      if (!existing) return outcome("not-found");
      if (!validStored(existing, id)) throw new Error("Inconsistent stored course");
      if (existing.version !== version) return outcome("conflict", id, existing.version, String(existing.fields.status));
      if (existing.fields.status !== "draft") return outcome("immutable", id, existing.version, "published");
      if (operation === "publish" && (!complete(inputFields) ||
        fieldNames.some((key) => inputFields[key] !== existing.fields[key]))) {
        // Publish only the exact previously saved and reviewed draft revision.
        return outcome("not-ready", id, version, "draft");
      }
      try {
        const saved = operation === "save"
          ? await storage.update(MODEL, id, version, inputFields)
          : await storage.update(MODEL, id, version, { status: "published" });
        return outcome(operation === "save" ? "saved" : "published", id, saved.version,
          operation === "save" ? "draft" : "published");
      } catch (error) {
        if (conflict(error)) return outcome("conflict", id);
        throw error;
      }
    },
  },
];

export default {
  async activate() { /* no ambient handles or request-global publication state */ },
  routes: route,
  adminViews: [{ id: "courses", routeId: "courses",
    title: { en: "Course Authoring", ar: "إدارة الدورات" } }],
  adminNavigation: [{ viewId: "courses", permission: "plugins.manage",
    label: { en: "Courses", ar: "الدورات" } }],
};
