import test from "node:test";
import assert from "node:assert/strict";
import extension from "../dist/extension/course-admin.mjs";

function createStore() {
  const data = new Map();
  const clone = (item) => item ? {
    id: item.id, version: item.version, fields: { ...item.fields },
  } : null;

  return {
    async get(model, id) {
      const key = model + ":" + id;
      return clone(data.get(key));
    },
    async list(model, limit = 20, cursor) {
      const prefix = model + ":";
      const matching = [...data.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([, v]) => clone(v))
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter((item) => cursor === undefined || item.id > cursor);
      const items = matching.slice(0, limit);
      return matching.length > limit
        ? { items, nextCursor: items[items.length - 1].id }
        : { items };
    },
    async create(model, id, fields) {
      const key = model + ":" + id;
      if (data.has(key)) {
        throw Object.assign(new Error("duplicate"), { code: "PLUGIN_STORAGE_CONFLICT" });
      }
      const item = { id, version: 1, fields: { ...fields } };
      data.set(key, item);
      return clone(item);
    },
    async update(model, id, expectedVersion, patch) {
      const key = model + ":" + id;
      const existing = data.get(key);
      if (!existing || existing.version !== expectedVersion) {
        throw Object.assign(new Error("conflict"), { code: "PLUGIN_STORAGE_CONFLICT" });
      }
      const updated = { id, version: existing.version + 1, fields: { ...existing.fields, ...patch } };
      data.set(key, updated);
      return clone(updated);
    },
    count(model) {
      const prefix = model + ":";
      return [...data.keys()].filter((k) => k.startsWith(prefix)).length;
    },
  };
}

function findRoute(id, audience, method) {
  const r = extension.routes.find((entry) =>
    entry.id === id && entry.audience === audience && entry.method === method);
  assert.ok(r, "Route not found: " + audience + " " + method + " " + id);
  return r;
}

const sampleCourse = {
  title_en: "Web Development Foundations",
  title_ar: "أساسيات تطوير الويب",
  summary_en: "Learn web engineering from scratch.",
  summary_ar: "تعلم هندسة الويب من البداية.",
  lesson_title_en: "Lesson 1: Introduction to HTML",
  lesson_title_ar: "الدرس 1: مقدمة في لغة HTML",
  lesson_body_en: "Protected content: HTML defines semantic structure.",
  lesson_body_ar: "محتوى محمي: تحدد لغة HTML البنية الدلالية.",
};

test("public catalog: empty when no courses or only drafts exist", async () => {
  const store = createStore();
  const catalogRoute = findRoute("catalog", "public", "GET");

  // Completely empty
  const emptyRes = await catalogRoute.handle(
    { query: {}, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, locale: "en", storage: store }
  );
  assert.equal(emptyRes.outcome, "empty");
  assert.equal(emptyRes.total, 0);

  // Add draft course
  await store.create("courses", "draft-course", { ...sampleCourse, status: "draft" });
  const draftOnlyRes = await catalogRoute.handle(
    { query: {}, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, locale: "en", storage: store }
  );
  assert.equal(draftOnlyRes.outcome, "empty");
  assert.equal(draftOnlyRes.total, 0);
  assert.equal(draftOnlyRes.catalogJson, "[]");
});

test("public catalog: projects published courses with deterministic ordering, hiding lesson bodies", async () => {
  const store = createStore();
  const catalogRoute = findRoute("catalog", "public", "GET");

  // Create two published courses and one draft
  await store.create("courses", "course-b", { ...sampleCourse, title_en: "Course B", status: "published" });
  await store.create("courses", "course-a", { ...sampleCourse, title_en: "Course A", status: "published" });
  await store.create("courses", "course-c-draft", { ...sampleCourse, title_en: "Course C Draft", status: "draft" });

  // English catalog
  const enRes = await catalogRoute.handle(
    { query: {}, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, locale: "en", storage: store }
  );
  assert.equal(enRes.outcome, "published");
  assert.equal(enRes.total, 2);
  assert.equal(enRes.courseId, "course-a"); // Sorted deterministically: course-a before course-b
  assert.equal(enRes.title, "Course A");
  assert.equal(enRes.lessonTitle, sampleCourse.lesson_title_en);

  // CRITICAL SECURITY ASSERTION: Private lesson body NEVER appears in public responses
  assert.equal(enRes.body, undefined);
  assert.equal(enRes.lesson_body_en, undefined);
  assert.equal(enRes.lesson_body_ar, undefined);
  assert.ok(!enRes.catalogJson.includes("Protected content"));

  // Arabic catalog
  const arRes = await catalogRoute.handle(
    { query: {}, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, locale: "ar", storage: store }
  );
  assert.equal(arRes.outcome, "published");
  assert.equal(arRes.locale, "ar");
  assert.equal(arRes.title, sampleCourse.title_ar);
  assert.equal(arRes.description, sampleCourse.summary_ar);
  assert.equal(arRes.lessonTitle, sampleCourse.lesson_title_ar);
  assert.ok(!arRes.catalogJson.includes("محتوى محمي"));

  const arabicRegion = await catalogRoute.handle(
    { query: {}, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, locale: "ar-SA", storage: store }
  );
  assert.equal(arabicRegion.locale, "ar");
  assert.equal(arabicRegion.title, sampleCourse.title_ar);
});

test("public catalog finds published content after draft-filled storage pages", async () => {
  const store = createStore();
  const catalog = findRoute("catalog", "public", "GET");
  for (let i = 0; i < 75; i++) {
    await store.create("courses", "a-draft-" + String(i).padStart(3, "0"), {
      ...sampleCourse, status: "draft",
    });
  }
  await store.create("courses", "z-published", {
    ...sampleCourse, status: "published",
  });
  const response = await catalog.handle(
    { query: {}, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, locale: "en", storage: store },
  );
  assert.equal(response.outcome, "published");
  assert.equal(response.courseId, "z-published");
  assert.equal(response.total, 1);
  assert.deepEqual(JSON.parse(response.catalogJson).map((item) => item.id), ["z-published"]);
});

test("public catalog stays valid JSON at the 4KB output limit", async () => {
  const store = createStore();
  const catalogRoute = findRoute("catalog", "public", "GET");
  for (let index = 0; index < 20; index++) {
    await store.create("courses", "course-" + String(index).padStart(2, "0"), {
      ...sampleCourse, status: "published", summary_en: "x".repeat(900),
    });
  }
  const response = await catalogRoute.handle(
    { query: {}, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, locale: "en", storage: store },
  );
  assert.equal(response.total, 20);
  assert.ok(response.catalogJson.length <= 4000);
  const cards = JSON.parse(response.catalogJson);
  assert.ok(Array.isArray(cards));
  assert.ok(cards.length > 0 && cards.length < response.total);
  assert.deepEqual(cards.map((card) => card.id), cards.map((card) => card.id).sort());
  assert.ok(!response.catalogJson.includes(sampleCourse.lesson_body_en));
});

test("public course detail: returns metadata for published course, not-found for draft", async () => {
  const store = createStore();
  const courseRoute = findRoute("course", "public", "GET");

  await store.create("courses", "published-01", { ...sampleCourse, status: "published" });
  await store.create("courses", "draft-01", { ...sampleCourse, status: "draft" });

  // Published course succeeds
  const pubRes = await courseRoute.handle(
    { query: { courseId: "published-01", locale: "en" }, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, storage: store }
  );
  assert.equal(pubRes.outcome, "published");
  assert.equal(pubRes.courseId, "published-01");
  assert.equal(pubRes.publicationId, "pub-1");
  assert.equal(pubRes.title, sampleCourse.title_en);
  assert.equal(pubRes.lessonTitle, sampleCourse.lesson_title_en);
  // Security check
  assert.equal(pubRes.body, undefined);

  // Draft course fails closed
  const draftRes = await courseRoute.handle(
    { query: { courseId: "draft-01", locale: "en" }, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, storage: store }
  );
  assert.equal(draftRes.outcome, "not-found");
  assert.equal(draftRes.title, "");

  // Non-existent course fails closed
  const missingRes = await courseRoute.handle(
    { query: { courseId: "non-existent", locale: "en" }, body: {} },
    { publicationId: "pub-1", principal: { kind: "anonymous" }, storage: store }
  );
  assert.equal(missingRes.outcome, "not-found");
});

test("member lifecycle: enrollment, protected lesson, completion, and progress tracking", async () => {
  const publicationStorage = createStore();
  const memberStorage = createStore();

  await publicationStorage.create("courses", "react-intro", { ...sampleCourse, status: "published" });
  await publicationStorage.create("courses", "secret-draft", { ...sampleCourse, status: "draft" });

  const scope = {
    publicationId: "pub-1",
    principal: { kind: "member", id: "member-1" },
    storage: publicationStorage,
    memberStorage: memberStorage,
  };

  const enrollRoute = findRoute("enroll", "member", "POST");
  const lessonRoute = findRoute("lesson", "member", "GET");
  const completeRoute = findRoute("complete", "member", "POST");
  const progressRoute = findRoute("progress", "member", "GET");

  // 1. Before enrollment: lesson and progress are denied/not-found
  const unauthLesson = await lessonRoute.handle(
    { query: { courseId: "react-intro", locale: "en" }, body: {} },
    scope
  );
  assert.equal(unauthLesson.outcome, "not-found");
  assert.equal(unauthLesson.body, "");

  const unauthProgress = await progressRoute.handle(
    { query: { courseId: "react-intro" }, body: {} },
    scope
  );
  assert.equal(unauthProgress.outcome, "not-authorized");

  // 2. Cannot enroll in draft course
  const draftEnroll = await enrollRoute.handle(
    { query: {}, body: { courseId: "secret-draft", locale: "en" } },
    scope
  );
  assert.equal(draftEnroll.outcome, "not-found");

  // 3. Successfully enroll in published course
  const enrollRes = await enrollRoute.handle(
    { query: {}, body: { courseId: "react-intro", locale: "en" } },
    scope
  );
  assert.equal(enrollRes.outcome, "created");
  assert.equal(enrollRes.courseId, "react-intro");

  // Repeat enrollment is idempotent
  const repeatEnroll = await enrollRoute.handle(
    { query: {}, body: { courseId: "react-intro", locale: "en" } },
    scope
  );
  assert.equal(repeatEnroll.outcome, "already-enrolled");

  // 4. Enrolled member can access protected lesson
  const lessonEn = await lessonRoute.handle(
    { query: { courseId: "react-intro", locale: "en" }, body: {} },
    scope
  );
  assert.equal(lessonEn.outcome, "allowed");
  assert.equal(lessonEn.title, sampleCourse.lesson_title_en);
  assert.equal(lessonEn.body, sampleCourse.lesson_body_en);

  // Arabic lesson body
  const lessonAr = await lessonRoute.handle(
    { query: { courseId: "react-intro", locale: "ar" }, body: {} },
    scope
  );
  assert.equal(lessonAr.outcome, "allowed");
  assert.equal(lessonAr.title, sampleCourse.lesson_title_ar);
  assert.equal(lessonAr.body, sampleCourse.lesson_body_ar);

  // 5. Initial progress is 0%
  const progBefore = await progressRoute.handle(
    { query: { courseId: "react-intro" }, body: {} },
    scope
  );
  assert.equal(progBefore.outcome, "available");
  assert.equal(progBefore.required, 1);
  assert.equal(progBefore.completed, 0);
  assert.equal(progBefore.percent, 0);

  // 6. Complete lesson
  const compRes = await completeRoute.handle(
    { query: {}, body: { courseId: "react-intro", locale: "en" } },
    scope
  );
  assert.equal(compRes.outcome, "completed");
  assert.equal(compRes.lessonId, "lesson");

  // Repeat completion is idempotent
  const repeatComp = await completeRoute.handle(
    { query: {}, body: { courseId: "react-intro", locale: "en" } },
    scope
  );
  assert.equal(repeatComp.outcome, "already-completed");

  // 7. Final progress is 100%
  const progAfter = await progressRoute.handle(
    { query: { courseId: "react-intro" }, body: {} },
    scope
  );
  assert.equal(progAfter.outcome, "available");
  assert.equal(progAfter.required, 1);
  assert.equal(progAfter.completed, 1);
  assert.equal(progAfter.percent, 100);
});

test("revoked and suspended enrollment fails closed", async () => {
  const pubStore = createStore();
  const memStore = createStore();
  await pubStore.create("courses", "react-intro", { ...sampleCourse, status: "published" });
  await memStore.create("enrollments", "react-intro", { course_key: "react-intro", state: "revoked" });

  const scope = {
    publicationId: "pub-1",
    principal: { kind: "member", id: "member-revoked" },
    storage: pubStore,
    memberStorage: memStore,
  };

  const enrollRoute = findRoute("enroll", "member", "POST");
  const lessonRoute = findRoute("lesson", "member", "GET");

  assert.equal(
    (await enrollRoute.handle({ query: {}, body: { courseId: "react-intro", locale: "en" } }, scope)).outcome,
    "reactivation-required"
  );
  assert.equal(
    (await lessonRoute.handle({ query: { courseId: "react-intro", locale: "en" }, body: {} }, scope)).outcome,
    "not-found"
  );
});
