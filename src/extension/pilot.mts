/**
 * EXT-501 pilot. Self-contained trusted ESM contribution for Vibress SDK 1.0.0.
 * These narrow structural types match the public PluginModule/PluginApiScope
 * interface. No Host internals or database connection is imported.
 * Operator MUST pin the final .mjs SHA-256 and approve the two storage models.
 * This is a fixed free-course acceptance fixture, NOT dynamic course authoring.
 */
type Scalar = string | number | boolean;
type Value = Scalar | null;
type Fields = Readonly<Record<string, Value>>;
interface StoredRecord {
  readonly id: string;
  readonly version: number;
  readonly fields: Fields;
}
interface MemberStorage {
  get(model: string, id: string): Promise<StoredRecord | null>;
  create(model: string, id: string, fields: Fields): Promise<StoredRecord>;
}
interface ApiScope {
  readonly publicationId: string;
  readonly locale?: string;
  readonly principal: { readonly kind: "member" | "staff" | "anonymous"; readonly id?: string };
  readonly memberStorage?: MemberStorage;
}
interface RouteInput {
  readonly query: Readonly<Record<string, Scalar>>;
  readonly body: Readonly<Record<string, Scalar>>;
}
interface Shape {
  readonly fields: Record<string, "string" | "number" | "boolean">;
  readonly required?: readonly string[];
}
interface Route {
  readonly id: string;
  readonly audience: "member" | "public";
  readonly method: "GET" | "POST";
  readonly query?: Shape;
  readonly body?: Shape;
  readonly response: Shape;
  readonly handle: (input: RouteInput, scope: ApiScope) => Promise<Record<string, Scalar>>;
}

const COURSE_ID = "pilot-foundations";
const LESSONS = ["welcome", "first-steps"] as const;
type Locale = "en" | "ar";
const TEXT: Readonly<Record<Locale, {
  title: string; description: string;
  lessons: Readonly<Record<(typeof LESSONS)[number], { title: string; body: string }>>;
}>> = {
  en: {
    title: "Vibress Learning Foundations",
    description: "A free, operator-approved LMS integration pilot.",
    lessons: {
      welcome: { title: "Welcome", body: "Welcome to the learning platform." },
      "first-steps": { title: "First steps", body: "Complete this lesson to record progress." },
    },
  },
  ar: {
    title: "أساسيات التعلم في فيبرس",
    description: "مقرر مجاني تجريبي معتمد من مشغّل المنصة.",
    lessons: {
      welcome: { title: "مرحبًا", body: "أهلًا بك في منصة التعلم." },
      "first-steps": { title: "الخطوات الأولى", body: "أكمل هذا الدرس لتسجيل تقدمك." },
    },
  },
};

function locale(value: Scalar | undefined): Locale | null {
  return value === "en" || value === "ar" ? value : null;
}
function isLesson(value: Scalar | undefined): value is (typeof LESSONS)[number] {
  return typeof value === "string" && LESSONS.some((id) => id === value);
}
function memberStorage(scope: ApiScope): MemberStorage | null {
  if (scope.principal.kind !== "member" || !scope.principal.id || !scope.publicationId) return null;
  return scope.memberStorage ?? null;
}
function conflict(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "PLUGIN_MEMBER_STORAGE_CONFLICT";
}
function validEnrollment(record: StoredRecord | null): "active" | "inactive" | "missing" {
  if (!record) return "missing";
  // Fail closed if operator data/schema drift produces a mismatched record.
  if (record.id !== COURSE_ID || record.fields.course_key !== COURSE_ID ||
      !["active", "suspended", "revoked"].includes(String(record.fields.state))) {
    throw new Error("Inconsistent LMS enrollment");
  }
  return record.fields.state === "active" ? "active" : "inactive";
}
function completionId(lesson: (typeof LESSONS)[number]): string {
  return `${COURSE_ID}__${lesson}`;
}
function validCompletion(record: StoredRecord | null, lesson: (typeof LESSONS)[number]): boolean {
  if (!record) return false;
  if (record.id !== completionId(lesson) || record.fields.course_key !== COURSE_ID ||
      record.fields.lesson_key !== lesson || typeof record.fields.completed_at !== "string") {
    throw new Error("Inconsistent LMS completion");
  }
  return true;
}
async function enrollment(storage: MemberStorage): Promise<"active" | "inactive" | "missing"> {
  return validEnrollment(await storage.get("enrollments", COURSE_ID));
}

const result = (name: string): Shape => ({ fields: { outcome: "string", [name]: "string" }, required: ["outcome", name] });
const courseInput: Shape = { fields: { courseId: "string" }, required: ["courseId"] };
const courseLocaleInput: Shape = { fields: { courseId: "string", locale: "string" }, required: ["courseId", "locale"] };
const lessonInput: Shape = { fields: { courseId: "string", lessonId: "string", locale: "string" }, required: ["courseId", "lessonId", "locale"] };

const routes: readonly Route[] = [
  {
    id: "catalog", audience: "public", method: "GET",
    response: { fields: { outcome: "string", courseId: "string", locale: "string",
      title: "string", description: "string" }, required: ["outcome", "courseId", "locale", "title", "description"] },
    async handle(_input, scope) {
      const lang = locale(scope.locale);
      return lang ? { outcome: "published", courseId: COURSE_ID, locale: lang,
        title: TEXT[lang].title, description: TEXT[lang].description } :
        { outcome: "unavailable", courseId: "", locale: "", title: "", description: "" };
    },
  },
  {
    id: "enroll", audience: "member", method: "POST", body: courseLocaleInput,
    response: result("courseId"),
    async handle({ body }, scope) {
      const storage = memberStorage(scope);
      if (!storage) return { outcome: "unavailable", courseId: "" };
      if (body.courseId !== COURSE_ID || !locale(body.locale)) {
        return { outcome: "not-found", courseId: "" };
      }
      const status = await enrollment(storage);
      if (status === "active") return { outcome: "already-enrolled", courseId: COURSE_ID };
      if (status === "inactive") return { outcome: "reactivation-required", courseId: "" };
      try {
        await storage.create("enrollments", COURSE_ID, { course_key: COURSE_ID, state: "active" });
        return { outcome: "created", courseId: COURSE_ID };
      } catch (error) {
        if (!conflict(error)) throw error;
        const retry = await enrollment(storage);
        if (retry === "missing") throw new Error("Concurrent LMS enrollment disappeared");
        return retry === "active" ? { outcome: "already-enrolled", courseId: COURSE_ID } :
          { outcome: "reactivation-required", courseId: "" };
      }
    },
  },
  {
    id: "lesson", audience: "member", method: "GET", query: lessonInput,
    response: { fields: { outcome: "string", title: "string", body: "string" }, required: ["outcome", "title", "body"] },
    async handle({ query }, scope) {
      const storage = memberStorage(scope);
      const lang = locale(query.locale);
      if (!storage || query.courseId !== COURSE_ID || !isLesson(query.lessonId) || !lang ||
          await enrollment(storage) !== "active") {
        return { outcome: "not-found", title: "", body: "" };
      }
      const lesson = TEXT[lang].lessons[query.lessonId];
      return { outcome: "allowed", title: lesson.title, body: lesson.body };
    },
  },
  {
    id: "complete", audience: "member", method: "POST", body: lessonInput,
    response: result("lessonId"),
    async handle({ body }, scope) {
      const storage = memberStorage(scope);
      if (!storage || body.courseId !== COURSE_ID || !isLesson(body.lessonId) ||
          !locale(body.locale) || await enrollment(storage) !== "active") {
        return { outcome: "not-authorized", lessonId: "" };
      }
      const lesson = body.lessonId;
      if (validCompletion(await storage.get("completions", completionId(lesson)), lesson)) {
        return { outcome: "already-completed", lessonId: lesson };
      }
      try {
        await storage.create("completions", completionId(lesson), {
          course_key: COURSE_ID, lesson_key: lesson, completed_at: new Date().toISOString(),
        });
        return { outcome: "completed", lessonId: lesson };
      } catch (error) {
        if (!conflict(error)) throw error;
        if (!validCompletion(await storage.get("completions", completionId(lesson)), lesson)) {
          throw new Error("Concurrent LMS completion disappeared");
        }
        return { outcome: "already-completed", lessonId: lesson };
      }
    },
  },
  {
    id: "progress", audience: "member", method: "GET", query: courseInput,
    response: { fields: { outcome: "string", required: "number", completed: "number", percent: "number" },
      required: ["outcome", "required", "completed", "percent"] },
    async handle({ query }, scope) {
      const storage = memberStorage(scope);
      if (!storage || query.courseId !== COURSE_ID || await enrollment(storage) !== "active") {
        return { outcome: "not-authorized", required: 0, completed: 0, percent: 0 };
      }
      let completed = 0;
      for (const lesson of LESSONS) {
        if (validCompletion(await storage.get("completions", completionId(lesson)), lesson)) completed++;
      }
      return { outcome: "available", required: LESSONS.length, completed,
        percent: Math.floor(100 * completed / LESSONS.length) };
    },
  },
];

/** Host validates this metadata and independently checks route capabilities. */
export default {
  async activate(): Promise<void> { /* No global side effects or privileged resources. */ },
  routes,
  publicViews: [{ id: "catalog", routeId: "catalog",
    title: { en: "Learning", ar: "التعلّم" }, publishedLocales: ["en", "ar"] }],
};
