import test from 'node:test';
import assert from 'node:assert/strict';
import { decideCoursePublication, decideFreeEnrollment } from '../dist/index.js';

const course = {
  id: 'course-1', publicationId: 'site-1', status: 'draft',
  access: 'free', curriculumRevision: 1,
  translations: [
    { locale: 'en', status: 'published', title: 'A Course', slug: 'course', description: '' },
    { locale: 'ar', status: 'published', title: 'دورة', slug: 'dawra', description: '' },
  ],
};
const sections = [ { id: 'section-1', publicationId: 'site-1', courseId: 'course-1', position: 0 } ];
const lesson = {
  id: 'lesson-1', publicationId: 'site-1', courseId: 'course-1',
  sectionId: 'section-1', required: true, status: 'published',
  translations: [
    { locale: 'en', status: 'published', title: 'Lesson', bodyRef: 'secret', mediaRef: null },
    { locale: 'ar', status: 'published', title: 'درس', bodyRef: 'private-ar', mediaRef: null },
  ],
};
const learner = { publicationId: 'site-1', memberId: 'member-1' };
const enrollment = { id: 'enrollment-1', publicationId: 'site-1', courseId: 'course-1', memberId: 'member-1', status: 'active' };
const publish = (c = course, ss = sections, ls = [lesson], defaultLocale = 'en') =>
  decideCoursePublication(c, ss, ls, defaultLocale);
const enroll = (c = { ...course, status: 'published' }, e = null, m = learner, locale = 'en') =>
  decideFreeEnrollment(c, e, m, locale);

test('complete Arabic/English curriculum can publish', () => {
  assert.deepEqual(publish(), { kind: 'ready' });
  assert.deepEqual(publish(course, sections, [lesson], 'ar'), { kind: 'ready' });
});
test('archived course and invalid curriculum revision are rejected', () => {
  assert.deepEqual(publish({ ...course, status: 'archived' }), { kind: 'invalid', reason: 'archived-course' });
  assert.deepEqual(publish({ ...course, curriculumRevision: 0 }), { kind: 'invalid', reason: 'invalid-course' });
});
test('primary locale must be published and BCP-47 canonical', () => {
  assert.deepEqual(publish(course, sections, [lesson], 'fr'), { kind: 'invalid', reason: 'missing-default-locale' });
  assert.deepEqual(publish(course, sections, [lesson], 'en-us'), { kind: 'invalid', reason: 'missing-default-locale' });
  assert.deepEqual(publish({ ...course, translations: [{ ...course.translations[0], locale: 'ar_XX' }] }), { kind: 'invalid', reason: 'invalid-translation' });
});
test('duplicate course translation and empty public title are rejected', () => {
  assert.deepEqual(publish({ ...course, translations: [...course.translations, course.translations[0]] }), { kind: 'invalid', reason: 'duplicate-translation' });
  assert.deepEqual(publish({ ...course, translations: [{ ...course.translations[0], title: ' ' }, course.translations[1]] }), { kind: 'invalid', reason: 'invalid-translation' });
});
test('foreign section/duplicate ID/position are rejected', () => {
  assert.deepEqual(publish(course, [{ ...sections[0], publicationId: 'site-2' }]), { kind: 'invalid', reason: 'invalid-section' });
  assert.deepEqual(publish(course, [sections[0], { ...sections[0], id: 'section-2' }]), { kind: 'invalid', reason: 'duplicate-section' });
  assert.deepEqual(publish(course, [sections[0], sections[0]]), { kind: 'invalid', reason: 'duplicate-section' });
});
test('foreign course/unknown section/duplicate lesson rejected', () => {
  assert.deepEqual(publish(course, sections, [{ ...lesson, courseId: 'course-2' }]), { kind: 'invalid', reason: 'invalid-lesson' });
  assert.deepEqual(publish(course, sections, [{ ...lesson, sectionId: 'section-2' }]), { kind: 'invalid', reason: 'invalid-lesson' });
  assert.deepEqual(publish(course, sections, [lesson, lesson]), { kind: 'invalid', reason: 'duplicate-lesson' });
});
test('empty and entirely optional curriculum cannot publish', () => {
  assert.deepEqual(publish(course, sections, []), { kind: 'invalid', reason: 'empty-curriculum' });
  assert.deepEqual(publish(course, sections, [{ ...lesson, required: false }]), { kind: 'invalid', reason: 'no-required-lesson' });
});
test('missing, draft and duplicate lesson locales fail safely', () => {
  assert.deepEqual(publish(course, sections, [{ ...lesson, translations: [lesson.translations[0]] }]), { kind: 'invalid', reason: 'untranslated-lesson' });
  assert.deepEqual(publish(course, sections, [{ ...lesson, translations: [lesson.translations[0], { ...lesson.translations[1], status: 'draft' }] }]), { kind: 'invalid', reason: 'untranslated-lesson' });
  assert.deepEqual(publish(course, sections, [{ ...lesson, translations: [...lesson.translations, lesson.translations[0]] }]), { kind: 'invalid', reason: 'duplicate-translation' });
});
test('draft lessons do not block public curriculum or expose private translations', () => {
  assert.deepEqual(publish(course, sections, [lesson, { ...lesson, id: 'lesson-2', status: 'draft', translations: [] }]), { kind: 'ready' });
});
test('free published course accepts new verified learner', () => {
  assert.deepEqual(enroll(), { kind: 'eligible' });
  assert.deepEqual(enroll({ ...course, status: 'published' }, null, learner, 'ar'), { kind: 'eligible' });
});
test('repeated enrollment is idempotent at decision level', () => {
  assert.deepEqual(enroll({ ...course, status: 'published' }, enrollment), { kind: 'already-enrolled' });
});
test('suspended/revoked learners need explicit reactivation', () => {
  for (const status of ['suspended', 'revoked']) {
    assert.deepEqual(enroll({ ...course, status: 'published' }, { ...enrollment, status }), { kind: 'reactivation-required' });
  }
});
test('paid courses never self-grant an entitlement', () => {
  assert.deepEqual(enroll({ ...course, status: 'published', access: 'paid' }), { kind: 'entitlement-required' });
  assert.deepEqual(enroll({ ...course, status: 'published', access: 'paid' }, enrollment), { kind: 'entitlement-required' });
});
test('cross-publication, wrong member, wrong course are not-found', () => {
  assert.deepEqual(enroll({ ...course, publicationId: 'site-2', status: 'published' }), { kind: 'not-found' });
  assert.deepEqual(enroll({ ...course, status: 'published' }, null, { ...learner, publicationId: 'site-2' }), { kind: 'not-found' });
  assert.deepEqual(enroll({ ...course, status: 'published' }, { ...enrollment, memberId: 'member-2' }), { kind: 'not-found' });
  assert.deepEqual(enroll({ ...course, status: 'published' }, { ...enrollment, courseId: 'course-2' }), { kind: 'not-found' });
});
test('draft/archived/absent locale cannot be enrolled', () => {
  assert.deepEqual(enroll(course), { kind: 'not-found' });
  assert.deepEqual(enroll({ ...course, status: 'archived' }), { kind: 'not-found' });
  assert.deepEqual(enroll({ ...course, status: 'published' }, null, learner, 'fr'), { kind: 'not-found' });
});
