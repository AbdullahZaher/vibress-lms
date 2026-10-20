import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeLesson, projectPublicCourse, calculateCourseProgress,
  decideLessonCompletion, LmsIntegrityError,
} from '../dist/index.js';

const member = Object.freeze({ publicationId: 'publication-a', memberId: 'member-a' });
const course = Object.freeze({
  id: 'course-a', publicationId: 'publication-a', status: 'published',
  access: 'free', curriculumRevision: 3,
  translations: [
    { locale: 'en', status: 'published', title: 'Course', slug: 'course', description: 'Safe metadata' },
    { locale: 'ar', status: 'published', title: 'دورة', slug: 'dawra', description: 'وصف' },
    { locale: 'fr', status: 'draft', title: 'Brouillon', slug: 'draft', description: 'No' },
  ],
});
const lesson = Object.freeze({
  id: 'lesson-a', publicationId: 'publication-a', courseId: 'course-a',
  sectionId: 'section-a', status: 'published', required: true,
  translations: [
    { locale: 'en', status: 'published', title: 'Lesson', bodyRef: 'private-en', mediaRef: 'video-en' },
    { locale: 'ar', status: 'published', title: 'درس', bodyRef: 'private-ar', mediaRef: 'video-ar' },
    { locale: 'fr', status: 'draft', title: 'Private', bodyRef: 'secret', mediaRef: 'secret-video' },
  ],
});
const enrollment = Object.freeze({
  id: 'enrollment-a', publicationId: 'publication-a', courseId: 'course-a',
  memberId: 'member-a', status: 'active',
});
const completion = Object.freeze({
  publicationId: 'publication-a', courseId: 'course-a',
  enrollmentId: 'enrollment-a', lessonId: 'lesson-a',
});
const access = (c = course, l = lesson, e = enrollment, m = member, locale = 'en') =>
  authorizeLesson(c, l, e, m, locale);

test('public course projection is a strict safe-field allowlist', () => {
  const view = projectPublicCourse(course, 'publication-a', 'ar');
  assert.deepEqual(view, {
    id: 'course-a', locale: 'ar', title: 'دورة', slug: 'dawra',
    description: 'وصف', access: 'free',
  });
  assert.equal(JSON.stringify(view).includes('private'), false);
  assert.equal(projectPublicCourse(course, 'publication-b', 'ar'), null);
  assert.equal(projectPublicCourse({ ...course, status: 'draft' }, 'publication-a', 'ar'), null);
  assert.equal(projectPublicCourse(course, 'publication-a', 'fr'), null);
  assert.equal(projectPublicCourse(course, 'publication-a', 'es'), null);
});

test('authorized learner gets only the exact published locale lesson', () => {
  assert.deepEqual(access().lesson, {
    id: 'lesson-a', courseId: 'course-a', locale: 'en', title: 'Lesson',
    bodyRef: 'private-en', mediaRef: 'video-en',
  });
  assert.equal(access(course, lesson, enrollment, member, 'ar').lesson.bodyRef, 'private-ar');
  assert.deepEqual(access(course, lesson, enrollment, member, 'fr'), { kind: 'not-found' });
  assert.deepEqual(access(course, lesson, enrollment, member, 'es'), { kind: 'not-found' });
});

test('cross-publication and cross-course access fail closed', () => {
  assert.deepEqual(access({ ...course, publicationId: 'publication-b' }), { kind: 'not-found' });
  assert.deepEqual(access(course, { ...lesson, publicationId: 'publication-b' }), { kind: 'not-found' });
  assert.deepEqual(access(course, { ...lesson, courseId: 'course-b' }), { kind: 'not-found' });
  assert.deepEqual(access(course, lesson, { ...enrollment, courseId: 'course-b' }), { kind: 'not-found' });
  assert.deepEqual(access(course, lesson, { ...enrollment, publicationId: 'publication-b' }), { kind: 'not-found' });
  assert.deepEqual(access(course, lesson, enrollment, { ...member, publicationId: 'publication-b' }), { kind: 'not-found' });
});

test('no member enrollment, wrong member and suspended/revoked enrollment are denied', () => {
  assert.deepEqual(access(course, lesson, null), { kind: 'not-found' });
  assert.deepEqual(access(course, lesson, { ...enrollment, memberId: 'member-b' }), { kind: 'not-found' });
  for (const status of ['revoked', 'suspended']) {
    assert.deepEqual(access(course, lesson, { ...enrollment, status }), { kind: 'not-found' });
  }
});

test('draft, archived and unlocalized content cannot leak', () => {
  for (const status of ['draft', 'archived']) {
    assert.deepEqual(access({ ...course, status }), { kind: 'not-found' });
    assert.deepEqual(access(course, { ...lesson, status }), { kind: 'not-found' });
  }
  assert.deepEqual(access(course, { ...lesson, translations: [{ ...lesson.translations[0], status: 'draft' }] }), { kind: 'not-found' });
});

test('paid content fails closed even with an active enrollment', () => {
  assert.deepEqual(access({ ...course, access: 'paid' }), { kind: 'entitlement-required' });
});

test('progress counts unique required published lessons; locale switch is irrelevant', () => {
  const optional = { ...lesson, id: 'optional', required: false };
  const draft = { ...lesson, id: 'draft', status: 'draft' };
  assert.deepEqual(calculateCourseProgress(course, enrollment, [lesson, optional, draft], [completion, completion], member), {
    required: 1, completed: 1, percent: 100, isComplete: true, curriculumRevision: 3,
  });
  const ar = { ...lesson, translations: [lesson.translations[1]] };
  assert.equal(calculateCourseProgress(course, enrollment, [ar], [completion], member)?.isComplete, true);
});

test('empty curriculum never auto-completes', () => {
  assert.deepEqual(calculateCourseProgress(course, enrollment, [], [], member), {
    required: 0, completed: 0, percent: 0, isComplete: false, curriculumRevision: 3,
  });
});

test('progress denies foreign member and inactive enrollment', () => {
  assert.equal(calculateCourseProgress(course, enrollment, [lesson], [], { ...member, memberId: 'member-b' }), null);
  assert.equal(calculateCourseProgress(course, { ...enrollment, status: 'revoked' }, [lesson], [], member), null);
});

test('invalid cross-tenant/course rows are rejected, not counted', () => {
  assert.throws(() => calculateCourseProgress(course, enrollment, [{ ...lesson, courseId: 'course-b' }], [], member), LmsIntegrityError);
  assert.throws(() => calculateCourseProgress(course, enrollment, [lesson, lesson], [], member), LmsIntegrityError);
  assert.throws(() => calculateCourseProgress(course, enrollment, [lesson], [{ ...completion, enrollmentId: 'foreign' }], member), LmsIntegrityError);
  assert.throws(() => calculateCourseProgress(course, enrollment, [lesson], [{ ...completion, publicationId: 'publication-b' }], member), LmsIntegrityError);
});

test('completion decision recognizes prior work and refuses denied lessons', () => {
  assert.deepEqual(decideLessonCompletion(course, lesson, enrollment, member, 'en', []), { kind: 'eligible' });
  assert.deepEqual(decideLessonCompletion(course, lesson, enrollment, member, 'en', [completion]), { kind: 'already-completed' });
  assert.deepEqual(decideLessonCompletion(course, lesson, null, member, 'en', []), { kind: 'not-authorized' });
  assert.deepEqual(decideLessonCompletion(course, lesson, enrollment, member, 'fr', []), { kind: 'not-authorized' });
  assert.throws(() => decideLessonCompletion(course, lesson, enrollment, member, 'en', [{ ...completion, courseId: 'course-b' }]), LmsIntegrityError);
});
