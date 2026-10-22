import test from 'node:test';
import assert from 'node:assert/strict';
import { LmsHostApplication } from '../dist/index.js';

const course = {
  id: 'course-a', publicationId: 'site-a', status: 'published',
  access: 'free', curriculumRevision: 1,
  translations: [
    { locale: 'en', status: 'published', slug: 'course', title: 'Course', description: 'Learn' },
    { locale: 'ar', status: 'published', slug: 'dawra', title: 'دورة', description: 'تعلم' },
  ],
};
const lesson = {
  id: 'lesson-a', publicationId: 'site-a', courseId: 'course-a',
  sectionId: 'section-a', status: 'published', required: true,
  translations: [
    { locale: 'en', status: 'published', title: 'Lesson',
      bodyRef: 'private-en', mediaRef: 'private-media' },
    { locale: 'ar', status: 'published', title: 'درس',
      bodyRef: 'private-ar', mediaRef: null },
  ],
};
const activeEnrollment = {
  id: 'enrollment-a', publicationId: 'site-a', courseId: 'course-a',
  memberId: 'learner-a', status: 'active',
};
const member = (publicationId = 'site-a', id = 'learner-a') => ({
  publicationId: 'site-a',
  currentMember: async () => ({ publicationId, id }),
});
const anonymous = {
  publicationId: 'site-a', currentMember: async () => null,
};
function fixture({
  courseRow = course, lessonRow = lesson, existing = null,
  insertion = { enrollment: activeEnrollment, inserted: true },
  throwOnInsert = false, catalogRows = [course], nextCursor = undefined,
  lessonRows = [lesson], completionRows = [], completionInserted = true,
  completionResult = undefined,
} = {}) {
  const calls = { insert: [], course: [], enrollment: [], list: [],
    progress: [], complete: [] };
  const repo = {
    async listLessons(pub, id) {
      calls.progress.push(['lessons', pub, id]);
      return lessonRows;
    },
    async listCompletions(pub, id, enrollmentId) {
      calls.progress.push(['completions', pub, id, enrollmentId]);
      return completionRows;
    },
    async insertLessonCompletionIfAbsent(input) {
      calls.complete.push(input);
      return completionResult ?? {
        completion: {
          publicationId: input.publicationId,
          courseId: input.courseId,
          enrollmentId: input.enrollmentId,
          lessonId: input.lessonId,
        },
        inserted: completionInserted,
      };
    },
    async listCourses(pub, limit, cursor) {
      calls.list.push([pub, limit, cursor]);
      return nextCursor === undefined
        ? { items: catalogRows }
        : { items: catalogRows, nextCursor };
    },
    async getCourse(pub, id) {
      calls.course.push([pub, id]);
      return pub === 'site-a' && id === 'course-a' ? courseRow : null;
    },
    async getLesson(pub, id, lessonId) {
      return pub === 'site-a' && id === 'course-a' && lessonId === 'lesson-a'
        ? lessonRow : null;
    },
    async getEnrollment(pub, id, memberId) {
      calls.enrollment.push([pub, id, memberId]);
      return existing;
    },
    async insertFreeEnrollmentIfAbsent(input) {
      calls.insert.push(input);
      if (throwOnInsert) throw new Error('transaction lost');
      return insertion;
    },
  };
  return { app: new LmsHostApplication(repo), calls };
}

test('published course metadata supports Arabic, hides lessons and excludes other publications', async () => {
  const { app } = fixture();
  assert.deepEqual(await app.getPublicCourse('site-a', 'course-a', 'ar'), {
    id: 'course-a', locale: 'ar', slug: 'dawra', title: 'دورة',
    description: 'تعلم', access: 'free',
  });
  assert.equal(await app.getPublicCourse('site-b', 'course-a', 'ar'), null);
  assert.equal(await app.getPublicCourse('site-a', 'course-a', 'fr'), null);
  assert.equal(JSON.stringify(await app.getPublicCourse('site-a', 'course-a', 'en'))
    .includes('private-media'), false);
});

test('unauthenticated, wrong-site and mismatched Member identities never enroll', async () => {
  const { app, calls } = fixture();
  assert.deepEqual(await app.enrollFree(anonymous, 'course-a', 'en'),
    { kind: 'unauthenticated' });
  assert.deepEqual(await app.enrollFree(member('site-b'), 'course-a', 'ar'),
    { kind: 'unauthenticated' });
  assert.deepEqual(await app.enrollFree({
    publicationId: 'site-b', currentMember: async () => ({ id: 'learner-a', publicationId: 'site-b' }),
  }, 'course-a', 'en'), { kind: 'not-found' });
  assert.equal(calls.insert.length, 0);
});

test('free enrollment uses a narrowly scoped atomic insert contract', async () => {
  const { app, calls } = fixture();
  assert.deepEqual(await app.enrollFree(member(), 'course-a', 'ar'), { kind: 'created' });
  assert.deepEqual(calls.insert, [{
    publicationId: 'site-a', courseId: 'course-a', memberId: 'learner-a',
  }]);
});

test('atomic duplicate race never claims a newly created enrollment', async () => {
  const { app } = fixture({
    insertion: { enrollment: activeEnrollment, inserted: false },
  });
  assert.deepEqual(await app.enrollFree(member(), 'course-a', 'en'),
    { kind: 'already-enrolled' });
});

test('existing active, revoked and paid enrollment policies fail closed', async () => {
  const already = fixture({ existing: activeEnrollment });
  assert.deepEqual(await already.app.enrollFree(member(), 'course-a', 'en'),
    { kind: 'already-enrolled' });
  assert.equal(already.calls.insert.length, 0);
  const revoked = fixture({
    insertion: { enrollment: { ...activeEnrollment, status: 'revoked' }, inserted: false },
  });
  assert.deepEqual(await revoked.app.enrollFree(member(), 'course-a', 'en'),
    { kind: 'reactivation-required' });
  const paid = fixture({ courseRow: { ...course, access: 'paid' } });
  assert.deepEqual(await paid.app.enrollFree(member(), 'course-a', 'en'),
    { kind: 'entitlement-required' });
  assert.equal(paid.calls.insert.length, 0);
});

test('compromised adapter returning another Member enrollment is rejected', async () => {
  const { app } = fixture({
    insertion: {
      enrollment: { ...activeEnrollment, memberId: 'learner-b' },
      inserted: true,
    },
  });
  assert.deepEqual(await app.enrollFree(member(), 'course-a', 'en'),
    { kind: 'not-found' });
});

test('database failures propagate and cannot be interpreted as enrollment success', async () => {
  const { app } = fixture({ throwOnInsert: true });
  await assert.rejects(app.enrollFree(member(), 'course-a', 'en'), /transaction lost/);
});

test('protected lesson reads require same-site active enrollment', async () => {
  const { app } = fixture({ existing: activeEnrollment });
  const allowed = await app.getProtectedLesson(member(), 'course-a', 'lesson-a', 'ar');
  assert.equal(allowed.kind, 'allowed');
  assert.equal(allowed.lesson?.bodyRef, 'private-ar');
  assert.deepEqual(await app.getProtectedLesson(member('site-b'), 'course-a', 'lesson-a', 'ar'),
    { kind: 'not-found' });
  assert.deepEqual(await app.getProtectedLesson(anonymous, 'course-a', 'lesson-a', 'en'),
    { kind: 'not-found' });
  const noEnrollment = fixture();
  assert.deepEqual(await noEnrollment.app.getProtectedLesson(member(), 'course-a', 'lesson-a', 'en'),
    { kind: 'not-found' });
});

test('paid lesson is never unlocked merely by Member enrollment', async () => {
  const { app } = fixture({ courseRow: { ...course, access: 'paid' },
    existing: activeEnrollment });
  assert.deepEqual(await app.getProtectedLesson(member(), 'course-a', 'lesson-a', 'en'),
    { kind: 'entitlement-required' });
});

test('public catalog is a bounded host-scoped English/Arabic projection', async () => {
  const foreign = { ...course, id: 'foreign', publicationId: 'site-b' };
  const draft = { ...course, id: 'draft', status: 'draft' };
  const spanish = { ...course, id: 'spanish',
    translations: [{ locale: 'es', status: 'published', slug: 'curso',
      title: 'Curso', description: 'Aprender' }] };
  const { app, calls } = fixture({
    catalogRows: [course, foreign, draft, spanish],
    nextCursor: 'cursor-2',
  });
  const result = await app.listPublicCourses('site-a', 'ar', 4, 'cursor-1');
  assert.deepEqual(result, {
    items: [{
      id: 'course-a', locale: 'ar', slug: 'dawra', title: 'دورة',
      description: 'تعلم', access: 'free',
    }],
    nextCursor: 'cursor-2',
  });
  assert.deepEqual(calls.list, [['site-a', 4, 'cursor-1']]);
  assert.equal(JSON.stringify(result).includes('private-media'), false);
});

test('catalog never invokes repository for invalid publication and invalid pagination', async () => {
  const { app, calls } = fixture();
  assert.deepEqual(await app.listPublicCourses('another/site', 'en'), { items: [] });
  assert.equal(calls.list.length, 0);
  await assert.rejects(app.listPublicCourses('site-a', 'en', 51), /pagination/);
  await assert.rejects(app.listPublicCourses('site-a', 'en', 0), /pagination/);
  await assert.rejects(app.listPublicCourses('site-a', 'en', 3, '../bad'), /pagination/);
  assert.equal(calls.list.length, 0);
});

test('catalog rejects an overfull/unbounded Host repository response', async () => {
  const { app } = fixture({ catalogRows: [course, course] });
  await assert.rejects(app.listPublicCourses('site-a', 'en', 1),
    /Host course catalog response/);
});


test('learner progress counts published required lessons only for same-site active Member', async () => {
  const complete = {
    publicationId: 'site-a', courseId: 'course-a',
    enrollmentId: 'enrollment-a', lessonId: 'lesson-a',
  };
  const { app } = fixture({ existing: activeEnrollment, completionRows: [complete] });
  const progress = await app.getCourseProgress(member(), 'course-a');
  assert.deepEqual(progress, {
    required: 1, completed: 1, percent: 100,
    isComplete: true, curriculumRevision: 1,
  });
  assert.equal(await app.getCourseProgress(anonymous, 'course-a'), null);
  assert.equal(await app.getCourseProgress(member('site-b'), 'course-a'), null);
});

test('private progress is blocked for revoked and paid enrollments', async () => {
  const revoked = fixture({ existing: { ...activeEnrollment, status: 'revoked' } });
  assert.equal(await revoked.app.getCourseProgress(member(), 'course-a'), null);
  const paid = fixture({
    courseRow: { ...course, access: 'paid' }, existing: activeEnrollment,
  });
  assert.equal(await paid.app.getCourseProgress(member(), 'course-a'), null);
  const draft = fixture({
    courseRow: { ...course, status: 'draft' }, existing: activeEnrollment,
  });
  assert.equal(await draft.app.getCourseProgress(member(), 'course-a'), null);
});

test('lesson completion atomically binds publication, enrollment and learner', async () => {
  const { app, calls } = fixture({ existing: activeEnrollment });
  assert.deepEqual(await app.completeLesson(member(), 'course-a', 'lesson-a', 'ar'),
    { kind: 'completed' });
  assert.deepEqual(calls.complete, [{
    publicationId: 'site-a', courseId: 'course-a',
    enrollmentId: 'enrollment-a', lessonId: 'lesson-a',
    memberId: 'learner-a',
  }]);
});

test('concurrent lesson completion returns already-completed and is idempotent', async () => {
  const { app } = fixture({
    existing: activeEnrollment, completionInserted: false,
  });
  assert.deepEqual(await app.completeLesson(member(), 'course-a', 'lesson-a', 'en'),
    { kind: 'already-completed' });
  const done = {
    publicationId: 'site-a', courseId: 'course-a',
    enrollmentId: 'enrollment-a', lessonId: 'lesson-a',
  };
  const previouslyDone = fixture({
    existing: activeEnrollment, completionRows: [done],
  });
  assert.deepEqual(await previouslyDone.app.completeLesson(
    member(), 'course-a', 'lesson-a', 'en',
  ), { kind: 'already-completed' });
  assert.equal(previouslyDone.calls.complete.length, 0);
});

test('completion denies wrong-site, revoked, paid and absent learner', async () => {
  for (const ctx of [anonymous, member('site-b')]) {
    const { app, calls } = fixture({ existing: activeEnrollment });
    assert.deepEqual(await app.completeLesson(ctx, 'course-a', 'lesson-a', 'ar'),
      { kind: 'not-authorized' });
    assert.equal(calls.complete.length, 0);
  }
  for (const options of [
    { existing: { ...activeEnrollment, status: 'revoked' } },
    { existing: activeEnrollment, courseRow: { ...course, access: 'paid' } },
    { existing: null },
  ]) {
    const { app, calls } = fixture(options);
    assert.deepEqual(await app.completeLesson(
      member(), 'course-a', 'lesson-a', 'en',
    ), { kind: 'not-authorized' });
    assert.equal(calls.complete.length, 0);
  }
});

test('host progress adapter cannot return another publication completion', async () => {
  const { app } = fixture({
    existing: activeEnrollment,
    completionRows: [{
      publicationId: 'site-b', courseId: 'course-a',
      enrollmentId: 'enrollment-a', lessonId: 'lesson-a',
    }],
  });
  await assert.rejects(app.getCourseProgress(member(), 'course-a'),
    /Inconsistent course-scoped LMS records/);
});

test('host completion adapter mismatch cannot create an authorized response', async () => {
  const { app } = fixture({
    existing: activeEnrollment,
    completionResult: {
      completion: {
        publicationId: 'site-b', courseId: 'course-a',
        enrollmentId: 'enrollment-a', lessonId: 'lesson-a',
      },
      inserted: true,
    },
  });
  await assert.rejects(app.completeLesson(member(), 'course-a', 'lesson-a', 'ar'),
    /unauthorized lesson completion/);
});
