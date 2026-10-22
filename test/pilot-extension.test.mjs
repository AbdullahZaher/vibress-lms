import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pilot from '../dist/extension/pilot.mjs';

function route(audience, method, id) {
  const found = pilot.routes.find((r) => r.audience === audience && r.method === method && r.id === id);
  assert.ok(found, `Missing ${audience} ${method} ${id}`);
  return found;
}
function store() {
  const records = new Map();
  return {
    async get(model, id) { return records.get(`${model}:${id}`) ?? null; },
    async create(model, id, fields) {
      const key = `${model}:${id}`;
      if (records.has(key)) throw Object.assign(new Error('duplicate'),
        { code: 'PLUGIN_MEMBER_STORAGE_CONFLICT' });
      const record = { id, version: 1, fields };
      records.set(key, record);
      return record;
    },
    inject(model, id, fields) { records.set(`${model}:${id}`, { id, version: 1, fields }); },
    count() { return records.size; },
  };
}
function host(member, publication, storage) {
  return { publicationId: publication, principal: member
    ? { kind: 'member', id: member } : { kind: 'anonymous' },
    ...(storage ? { memberStorage: storage } : {}) };
}
function call(audience, method, id, scope, params = {}) {
  return route(audience, method, id).handle({
    query: method === 'GET' ? params : {}, body: method === 'POST' ? params : {},
  }, scope);
}
const courseId = 'pilot-foundations';
const create = (scope) => call('member', 'POST', 'enroll', scope,
  { courseId, locale: 'ar' });

// These mocks model Host-isolated data and prove the extension cannot select
// owners. Independent core HTTP+Postgres acceptance is a SEPARATE release gate.
test('free enrollment, protected lessons, repeat completion and progress', async () => {
  const s = store(), member = host('student-1', 'site-a', s);
  assert.deepEqual(await call('member', 'GET', 'lesson', member,
    { courseId, lessonId: 'welcome', locale: 'ar' }),
  { outcome: 'not-found', title: '', body: '' });
  assert.deepEqual(await create(member), { outcome: 'created', courseId });
  assert.deepEqual(await create(member), { outcome: 'already-enrolled', courseId });
  const lesson = await call('member', 'GET', 'lesson', member,
    { courseId, lessonId: 'welcome', locale: 'ar' });
  assert.equal(lesson.outcome, 'allowed');
  assert.equal(lesson.title, 'مرحبًا');
  assert.equal(lesson.body, 'أهلًا بك في منصة التعلم.');
  assert.deepEqual(await call('member', 'GET', 'progress', member, { courseId }),
    { outcome: 'available', required: 2, completed: 0, percent: 0 });
  const complete = () => call('member', 'POST', 'complete', member,
    { courseId, lessonId: 'welcome', locale: 'en' });
  assert.deepEqual(await complete(), { outcome: 'completed', lessonId: 'welcome' });
  assert.deepEqual(await complete(), { outcome: 'already-completed', lessonId: 'welcome' });
  assert.deepEqual(await call('member', 'GET', 'progress', member, { courseId }),
    { outcome: 'available', required: 2, completed: 1, percent: 50 });
  assert.equal(s.count(), 2);
});

test('idempotent concurrent enrollment and completion within Host-owned uniqueness', async () => {
  const member = host('student-1', 'site-a', store());
  const outcomes = await Promise.all(Array.from({ length: 10 }, () => create(member)));
  assert.equal(outcomes.filter((v) => v.outcome === 'created').length, 1);
  assert.equal(outcomes.filter((v) => v.outcome === 'already-enrolled').length, 9);
  const done = await Promise.all(Array.from({ length: 10 }, () => call(
    'member', 'POST', 'complete', member,
    { courseId, lessonId: 'first-steps', locale: 'ar' })));
  assert.equal(done.filter((v) => v.outcome === 'completed').length, 1);
  assert.equal(done.filter((v) => v.outcome === 'already-completed').length, 9);
});

test('owner/site separation uses opaque Host-scoped storage and never caller owner IDs', async () => {
  const s1 = store(), s2 = store(), s3 = store();
  const one = host('alice', 'publication-a', s1);
  const other = host('bob', 'publication-a', s2);
  const foreign = host('alice', 'publication-b', s3);
  await create(one);
  for (const scope of [other, foreign]) {
    assert.deepEqual(await call('member', 'GET', 'progress', scope, { courseId }),
      { outcome: 'not-authorized', required: 0, completed: 0, percent: 0 });
    assert.deepEqual(await call('member', 'GET', 'lesson', scope,
      { courseId, lessonId: 'welcome', locale: 'en' }),
      { outcome: 'not-found', title: '', body: '' });
  }
  assert.equal(s2.count(), 0);
  assert.equal(s3.count(), 0);
});

test('anonymous, unsupported locale, forged course/lesson and missing grant fail closed', async () => {
  const noMember = host(null, 'site-a');
  const unavailable = host('alice', 'site-a');
  for (const scope of [noMember, unavailable]) {
    assert.equal((await create(scope)).outcome, 'unavailable');
    assert.equal((await call('member', 'POST', 'complete', scope,
      { courseId, lessonId: 'welcome', locale: 'en' })).outcome, 'not-authorized');
  }
  const member = host('alice', 'site-a', store());
  assert.equal((await call('member', 'POST', 'enroll', member,
    { courseId, locale: 'fr' })).outcome, 'not-found');
  assert.equal((await call('member', 'POST', 'enroll', member,
    { courseId: 'other-course', locale: 'ar' })).outcome, 'not-found');
  assert.equal((await call('member', 'GET', 'lesson', member,
    { courseId, lessonId: 'private-lesson', locale: 'en' })).outcome, 'not-found');
  assert.equal((await call('member', 'POST', 'complete', member,
    { courseId, lessonId: 'private-lesson', locale: 'ar' })).outcome, 'not-authorized');
});

test('revoked enrollments are never silently reactivated, and datastore errors propagate', async () => {
  const s = store(), member = host('alice', 'site-a', s);
  s.inject('enrollments', courseId, { course_key: courseId, state: 'revoked' });
  assert.equal((await create(member)).outcome, 'reactivation-required');
  assert.equal((await call('member', 'GET', 'lesson', member,
    { courseId, lessonId: 'welcome', locale: 'ar' })).outcome, 'not-found');
  assert.equal((await call('member', 'GET', 'progress', member, { courseId })).outcome,
    'not-authorized');
  const bad = store();
  bad.inject('enrollments', courseId, { course_key: 'forged', state: 'active' });
  await assert.rejects(create(host('alice', 'site-a', bad)), /Inconsistent/);
  const broken = host('alice', 'site-a', {
    get: async () => { throw new Error('provider unavailable'); },
    create: async () => { throw new Error('provider unavailable'); },
  });
  await assert.rejects(create(broken), /provider unavailable/);
});



test('suspended enrollment is never reactivated and cannot authorize lessons or progress', async () => {
  const s = store(), learner = host('learner-a', 'site-a', s);
  s.inject('enrollments', courseId, { course_key: courseId, state: 'suspended' });
  assert.deepEqual(await create(learner),
    { outcome: 'reactivation-required', courseId: '' });
  assert.deepEqual(await call('member', 'GET', 'lesson', learner,
    { courseId, lessonId: 'welcome', locale: 'en' }),
    { outcome: 'not-found', title: '', body: '' });
  assert.deepEqual(await call('member', 'GET', 'progress', learner, { courseId }),
    { outcome: 'not-authorized', required: 0, completed: 0, percent: 0 });
  assert.deepEqual(await call('member', 'POST', 'complete', learner,
    { courseId, lessonId: 'welcome', locale: 'ar' }),
    { outcome: 'not-authorized', lessonId: '' });
  assert.equal(s.count(), 1);
});

test('public locale-specific metadata excludes protected lesson content and private IDs', async () => {
  for (const locale of ['en', 'ar']) {
    const projection = await call('public', 'GET', 'catalog', {
      publicationId: 'site-a', principal: { kind: 'anonymous' }, locale });
    assert.equal(projection.outcome, 'published');
    assert.equal(projection.locale, locale);
    assert.equal(projection.courseId, courseId);
    assert.equal(JSON.stringify(projection).includes('Welcome to the learning platform.'), false);
    assert.equal(JSON.stringify(projection).includes('member'), false);
  }
  const other = await call('public', 'GET', 'catalog', {
    publicationId: 'site-a', principal: { kind: 'anonymous' }, locale: 'fr' });
  assert.equal(other.outcome, 'unavailable');
  assert.deepEqual(pilot.publicViews[0].publishedLocales, ['en', 'ar']);
});

test('release pin and operator migration descriptors are deterministic and consistent', async () => {
  const release = new URL('../dist/pilot-release/', import.meta.url);
  const lock = JSON.parse(await readFile(new URL('trusted-plugins.json', release), 'utf8'));
  const migration = JSON.parse(await readFile(new URL('operator-migration-plan.json', release), 'utf8'));
  const artifact = await readFile(new URL('vibress-lms-pilot.mjs', release));
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  assert.equal(lock.schemaVersion, 1);
  assert.equal(lock.plugins[0].sha256, hash(artifact));
  assert.equal(lock.plugins[0].manifest.vibressApiVersion, '1.0.0');
  assert.equal(lock.plugins[0].manifest.entrypoint, 'vibress-lms-pilot.mjs');
  assert.deepEqual(lock.plugins[0].storageModels, migration.models);
  assert.equal(migration.artifactSha256, hash(artifact));
  assert.equal(migration.migrationSha256, hash(JSON.stringify(migration.models.map((m) => ({
    key: m.key, schemaSha256: m.schemaSha256,
  })))));
  for (const model of migration.models) {
    assert.equal(model.schemaSha256, hash(JSON.stringify(model.columns)));
  }
  assert.deepEqual(lock.plugins[0].manifest.capabilities, [
    'extension.routes.public', 'extension.routes.member',
    'extension.member_storage.read', 'extension.member_storage.write',
  ]);
  assert.equal(pilot.routes.length, 5);
  for (const item of pilot.routes) {
    assert.ok(item.response.required.length);
    assert.ok(item.response.required.every((field) => Object.hasOwn(item.response.fields, field)));
    assert.notEqual(item.audience, 'admin');
    if (item.method === 'GET') assert.equal(item.body, undefined);
  }
});
