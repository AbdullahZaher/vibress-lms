type Scalar = string | number | boolean;
type Value = Scalar;
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
interface MemberStorage {
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
  readonly locale?: string;
  readonly storage?: Storage;
  readonly memberStorage?: MemberStorage;
}
interface Input {
  readonly query: Readonly<Record<string, Scalar>>;
  readonly body: Readonly<Record<string, Scalar>>;
}
type Shape = { readonly fields: Record<string, "string" | "number">; readonly required?: readonly string[] };
interface Route {
  readonly id: string; readonly audience: "admin" | "public" | "member"; readonly method: "GET" | "POST";
  readonly permission?: "plugins.manage";
  readonly query?: Shape; readonly body?: Shape; readonly response: Shape;
  readonly handle: (input: Input, scope: Scope) => Promise<Record<string, Scalar>>;
}
const MODEL_COURSES = "courses";
const MODEL_ENROLLMENTS = "enrollments";
const MODEL_COMPLETIONS = "completions";
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
function memberStorage(scope: Scope): MemberStorage | null {
  return scope.publicationId && scope.principal.kind === "member" && scope.principal.id
    ? scope.memberStorage ?? null : null;
}
function memberCourseStorage(scope: Scope): Storage | null {
  return scope.publicationId && scope.principal.kind === "member" && scope.principal.id
    ? scope.storage ?? null : null;
}
function publicStorage(scope: Scope): Storage | null {
  return scope.publicationId ? scope.storage ?? null : null;
}
function parseCourseId(value: Scalar | undefined): string | null {
  return typeof value === "string" && COURSE_ID.test(value) ? value : null;
}
function parseLocale(value: Scalar | undefined): "en" | "ar" | null {
  return value === "en" || value === "ar" ? value : null;
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
    (error.code === "PLUGIN_STORAGE_CONFLICT" ||
     error.code === "PLUGIN_STORAGE_VERSION_CONFLICT" ||
     error.code === "PLUGIN_MEMBER_STORAGE_CONFLICT");
}
function validEnrollment(record: RecordItem | null, id: string): "active" | "inactive" | "missing" {
  if (!record) return "missing";
  if (record.id !== id || record.fields.course_key !== id ||
      !["active", "suspended", "revoked"].includes(String(record.fields.state))) {
    throw new Error("Inconsistent LMS enrollment");
  }
  return record.fields.state === "active" ? "active" : "inactive";
}
function completionId(id: string): string {
  return id + "__lesson";
}
function validCompletion(record: RecordItem | null, id: string): boolean {
  if (!record) return false;
  if (record.id !== completionId(id) || record.fields.course_key !== id ||
      record.fields.lesson_key !== "lesson" || typeof record.fields.completed_at !== "string") {
    throw new Error("Inconsistent LMS completion");
  }
  return true;
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
      const { items } = await storage.list(MODEL_COURSES, 1);
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
      const id = parseCourseId(body.courseId);
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
          const record = await storage.create(MODEL_COURSES, id, { ...inputFields, status: "draft" });
          return outcome("created", id, record.version, "draft");
        } catch (error) {
          if (conflict(error)) return outcome("conflict", id);
          throw error;
        }
      }
      const existing = await storage.get(MODEL_COURSES, id);
      if (!existing) return outcome("not-found");
      if (!validStored(existing, id)) throw new Error("Inconsistent stored course");
      if (existing.version !== version) return outcome("conflict", id, existing.version, String(existing.fields.status));
      if (existing.fields.status !== "draft") return outcome("immutable", id, existing.version, "published");
      if (operation === "publish" && (!complete(inputFields) ||
        fieldNames.some((key) => inputFields[key] !== existing.fields[key]))) {
        return outcome("not-ready", id, version, "draft");
      }
      try {
        const saved = operation === "save"
          ? await storage.update(MODEL_COURSES, id, version, inputFields)
          : await storage.update(MODEL_COURSES, id, version, { status: "published" });
        return outcome(operation === "save" ? "saved" : "published", id, saved.version,
          operation === "save" ? "draft" : "published");
      } catch (error) {
        if (conflict(error)) return outcome("conflict", id);
        throw error;
      }
    },
  },
  {
    id: "catalog", audience: "public", method: "GET",
    response: { fields: {
      outcome: "string", total: "number", courseId: "string", locale: "string",
      title: "string", description: "string", lessonTitle: "string", catalogJson: "string",
    }, required: [
      "outcome", "total", "courseId", "locale", "title", "description", "lessonTitle", "catalogJson",
    ] },
    async handle(_input, scope) {
      const storage = publicStorage(scope);
      const lang = parseLocale(scope.locale) ?? "en";
      if (!storage) {
        return { outcome: "unavailable", total: 0, courseId: "", locale: lang, title: "", description: "", lessonTitle: "", catalogJson: "[]" };
      }
      const { items } = await storage.list(MODEL_COURSES, 20);
      const published = items.filter((item) => item.fields.status === "published" && validStored(item, item.id));
      if (published.length === 0) {
        return { outcome: "empty", total: 0, courseId: "", locale: lang, title: "", description: "", lessonTitle: "", catalogJson: "[]" };
      }
      published.sort((a, b) => a.id.localeCompare(b.id));
      const first = published[0];
      if (!first) {
        return { outcome: "empty", total: 0, courseId: "", locale: lang, title: "", description: "", lessonTitle: "", catalogJson: "[]" };
      }
      const summaryList = published.map((item) => ({
        id: item.id,
        title: String(lang === "ar" ? item.fields.title_ar : item.fields.title_en),
        description: String(lang === "ar" ? item.fields.summary_ar : item.fields.summary_en),
        lessonTitle: String(lang === "ar" ? item.fields.lesson_title_ar : item.fields.lesson_title_en),
      }));
      return {
        outcome: "published",
        total: published.length,
        courseId: first.id,
        locale: lang,
        title: String(lang === "ar" ? first.fields.title_ar : first.fields.title_en),
        description: String(lang === "ar" ? first.fields.summary_ar : first.fields.summary_en),
        lessonTitle: String(lang === "ar" ? first.fields.lesson_title_ar : first.fields.lesson_title_en),
        catalogJson: JSON.stringify(summaryList).slice(0, 4000),
      };
    },
  },
  {
    id: "course", audience: "public", method: "GET",
    query: { fields: { courseId: "string", locale: "string" }, required: ["courseId", "locale"] },
    response: { fields: {
      outcome: "string", courseId: "string", locale: "string",
      title: "string", description: "string", lessonTitle: "string",
    }, required: ["outcome", "courseId", "locale", "title", "description", "lessonTitle"] },
    async handle({ query }, scope) {
      const storage = publicStorage(scope);
      const id = parseCourseId(query.courseId);
      const lang = parseLocale(query.locale);
      if (!storage || !id || !lang) {
        return { outcome: "not-found", courseId: "", locale: "", title: "", description: "", lessonTitle: "" };
      }
      const item = await storage.get(MODEL_COURSES, id);
      if (!item || item.fields.status !== "published" || !validStored(item, id)) {
        return { outcome: "not-found", courseId: "", locale: "", title: "", description: "", lessonTitle: "" };
      }
      return {
        outcome: "published",
        courseId: item.id,
        locale: lang,
        title: String(lang === "ar" ? item.fields.title_ar : item.fields.title_en),
        description: String(lang === "ar" ? item.fields.summary_ar : item.fields.summary_en),
        lessonTitle: String(lang === "ar" ? item.fields.lesson_title_ar : item.fields.lesson_title_en),
      };
    },
  },
  {
    id: "enroll", audience: "member", method: "POST",
    body: { fields: { courseId: "string", locale: "string" }, required: ["courseId", "locale"] },
    response: { fields: { outcome: "string", courseId: "string" }, required: ["outcome", "courseId"] },
    async handle({ body }, scope) {
      const storage = memberStorage(scope);
      const courseStore = memberCourseStorage(scope);
      const id = parseCourseId(body.courseId);
      const lang = parseLocale(body.locale);
      if (!storage || !courseStore || !id || !lang) {
        return { outcome: "not-found", courseId: "" };
      }
      const course = await courseStore.get(MODEL_COURSES, id);
      if (!course || course.fields.status !== "published" || !validStored(course, id)) {
        return { outcome: "not-found", courseId: "" };
      }
      const current = validEnrollment(await storage.get(MODEL_ENROLLMENTS, id), id);
      if (current === "active") return { outcome: "already-enrolled", courseId: id };
      if (current === "inactive") return { outcome: "reactivation-required", courseId: "" };
      try {
        await storage.create(MODEL_ENROLLMENTS, id, { course_key: id, state: "active" });
        return { outcome: "created", courseId: id };
      } catch (error) {
        if (!conflict(error)) throw error;
        const retry = validEnrollment(await storage.get(MODEL_ENROLLMENTS, id), id);
        if (retry === "missing") throw new Error("Concurrent LMS enrollment disappeared");
        return retry === "active"
          ? { outcome: "already-enrolled", courseId: id }
          : { outcome: "reactivation-required", courseId: "" };
      }
    },
  },
  {
    id: "lesson", audience: "member", method: "GET",
    query: { fields: { courseId: "string", locale: "string" }, required: ["courseId", "locale"] },
    response: { fields: { outcome: "string", title: "string", body: "string" }, required: ["outcome", "title", "body"] },
    async handle({ query }, scope) {
      const storage = memberStorage(scope);
      const courseStore = memberCourseStorage(scope);
      const id = parseCourseId(query.courseId);
      const lang = parseLocale(query.locale);
      if (!storage || !courseStore || !id || !lang) {
        return { outcome: "not-found", title: "", body: "" };
      }
      const status = validEnrollment(await storage.get(MODEL_ENROLLMENTS, id), id);
      if (status !== "active") return { outcome: "not-found", title: "", body: "" };
      const course = await courseStore.get(MODEL_COURSES, id);
      if (!course || course.fields.status !== "published" || !validStored(course, id)) {
        return { outcome: "not-found", title: "", body: "" };
      }
      const title = String(lang === "ar" ? course.fields.lesson_title_ar : course.fields.lesson_title_en);
      const body = String(lang === "ar" ? course.fields.lesson_body_ar : course.fields.lesson_body_en);
      return { outcome: "allowed", title, body };
    },
  },
  {
    id: "complete", audience: "member", method: "POST",
    body: { fields: { courseId: "string", locale: "string" }, required: ["courseId", "locale"] },
    response: { fields: { outcome: "string", lessonId: "string" }, required: ["outcome", "lessonId"] },
    async handle({ body }, scope) {
      const storage = memberStorage(scope);
      const courseStore = memberCourseStorage(scope);
      const id = parseCourseId(body.courseId);
      const lang = parseLocale(body.locale);
      if (!storage || !courseStore || !id || !lang) {
        return { outcome: "not-authorized", lessonId: "" };
      }
      const status = validEnrollment(await storage.get(MODEL_ENROLLMENTS, id), id);
      if (status !== "active") return { outcome: "not-authorized", lessonId: "" };
      const course = await courseStore.get(MODEL_COURSES, id);
      if (!course || course.fields.status !== "published" || !validStored(course, id)) {
        return { outcome: "not-authorized", lessonId: "" };
      }
      const cid = completionId(id);
      if (validCompletion(await storage.get(MODEL_COMPLETIONS, cid), id)) {
        return { outcome: "already-completed", lessonId: "lesson" };
      }
      try {
        await storage.create(MODEL_COMPLETIONS, cid, {
          course_key: id, lesson_key: "lesson", completed_at: new Date().toISOString(),
        });
        return { outcome: "completed", lessonId: "lesson" };
      } catch (error) {
        if (!conflict(error)) throw error;
        if (!validCompletion(await storage.get(MODEL_COMPLETIONS, cid), id)) {
          throw new Error("Concurrent LMS completion disappeared");
        }
        return { outcome: "already-completed", lessonId: "lesson" };
      }
    },
  },
  {
    id: "progress", audience: "member", method: "GET",
    query: { fields: { courseId: "string" }, required: ["courseId"] },
    response: { fields: {
      outcome: "string", required: "number", completed: "number", percent: "number",
    }, required: ["outcome", "required", "completed", "percent"] },
    async handle({ query }, scope) {
      const storage = memberStorage(scope);
      const courseStore = memberCourseStorage(scope);
      const id = parseCourseId(query.courseId);
      if (!storage || !courseStore || !id) {
        return { outcome: "not-authorized", required: 0, completed: 0, percent: 0 };
      }
      const status = validEnrollment(await storage.get(MODEL_ENROLLMENTS, id), id);
      if (status !== "active") {
        return { outcome: "not-authorized", required: 0, completed: 0, percent: 0 };
      }
      const course = await courseStore.get(MODEL_COURSES, id);
      if (!course || course.fields.status !== "published" || !validStored(course, id)) {
        return { outcome: "not-authorized", required: 0, completed: 0, percent: 0 };
      }
      const isCompleted = validCompletion(await storage.get(MODEL_COMPLETIONS, completionId(id)), id);
      return {
        outcome: "available",
        required: 1,
        completed: isCompleted ? 1 : 0,
        percent: isCompleted ? 100 : 0,
      };
    },
  },
];

export default {
  async activate(): Promise<void> { /* no ambient handles or request-global publication state */ },
  routes: route,
  publicViews: [{ id: "catalog", routeId: "catalog",
    title: { en: "Course Catalog", ar: "دليل الدورات" }, publishedLocales: ["en", "ar"] }],
  adminViews: [{ id: "courses", routeId: "courses",
    title: { en: "Course Authoring", ar: "إدارة الدورات" } }],
  adminNavigation: [{ viewId: "courses", permission: "plugins.manage",
    label: { en: "Courses", ar: "الدورات" } }],
};
