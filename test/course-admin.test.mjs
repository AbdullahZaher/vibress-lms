import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import extension from '../dist/extension/course-admin.mjs';

const COURSE = 'first-course';
const fields = {
  title_en:'Foundations', title_ar:'الأساسيات',
  summary_en:'Introductory course', summary_ar:'دورة تمهيدية',
  lesson_title_en:'Welcome', lesson_title_ar:'مرحبًا',
  lesson_body_en:'Protected lesson content', lesson_body_ar:'نص الدرس المحمي',
};
function store() {
  const records = new Map();
  const clone = (record) => record ? {
    id: record.id, version: record.version, fields: { ...record.fields },
  } : null;
  return {
    async get(model,id) { assert.equal(model,'courses'); return clone(records.get(id)); },
    async list(model,limit=20) {
      assert.equal(model,'courses');
      return { items: [...records.values()].sort((a,b) => a.id.localeCompare(b.id))
        .slice(0,limit).map(clone) };
    },
    async create(model,id,data) {
      assert.equal(model,'courses');
      if(records.has(id)) throw Object.assign(new Error('duplicate'),{code:'PLUGIN_STORAGE_CONFLICT'});
      const record = { id, version:1, fields:{...data} };
      records.set(id,record);
      return clone(record);
    },
    async update(model,id,expectedVersion,patch) {
      assert.equal(model,'courses');
      const record = records.get(id);
      if(!record || record.version !== expectedVersion) {
        throw Object.assign(new Error('version conflict'), {code:'PLUGIN_STORAGE_CONFLICT'});
      }
      const updated = { id, version:record.version + 1, fields:{...record.fields,...patch} };
      records.set(id,updated);
      return clone(updated);
    },
    count() { return records.size; },
    snapshot(id) { return clone(records.get(id)); },
  };
}
function host(publication, storage, kind='staff') {
  return { publicationId: publication,
    principal: { kind, id:'staff-1' },
    ...(storage ? { storage } : {}) };
}
function route(method) {
  const target = extension.routes.find((r) =>
    r.id === 'courses' && r.method === method && r.audience === 'admin');
  assert.ok(target);
  return target;
}
const get = (scope) => route('GET').handle({ query:{}, body:{} },scope);
const post = (scope, operation, courseId=COURSE, expectedVersion=0, input=fields) =>
  route('POST').handle({ query:{},
    body:{ operation, courseId, expectedVersion, ...input } },scope);

test('authoring & delivery exposes declared admin, public, and member routes', () => {
  assert.equal(extension.routes.length, 8);
  const adminRoutes = extension.routes.filter(r => r.audience === 'admin');
  assert.equal(adminRoutes.length, 2);
  for(const r of adminRoutes) {
    assert.equal(r.permission, 'plugins.manage');
  }
  const publicRoutes = extension.routes.filter(r => r.audience === 'public');
  assert.equal(publicRoutes.length, 2);
  const memberRoutes = extension.routes.filter(r => r.audience === 'member');
  assert.equal(memberRoutes.length, 4);

  assert.deepEqual(extension.adminNavigation[0].label, { en: 'Courses', ar: 'الدورات' });
  assert.deepEqual(extension.adminViews[0].title, { en: 'Course Authoring', ar: 'إدارة الدورات' });
  assert.deepEqual(extension.publicViews[0].title, { en: 'Course Catalog', ar: 'دليل الدورات' });
  assert.deepEqual(extension.publicViews[0].publishedLocales, ['en', 'ar']);
  assert.ok(route('POST').body.required.includes('lesson_body_ar'));
  assert.equal(route('GET').query, undefined);
});

test('creates bilingual draft, saves revised text, publishes exact saved version and seals changes', async () => {
  const storage = store(), scope = host('publication-a',storage);
  assert.equal((await get(scope)).outcome,'empty');
  assert.deepEqual(await post(scope,'create'), {
    outcome:'created',courseId:COURSE,version:1,status:'draft',
  });
  const draft = await get(scope);
  assert.equal(draft.title_ar,'الأساسيات');
  assert.equal(draft.lesson_body_en,fields.lesson_body_en);
  assert.equal(draft.version,1);
  const edit = {...fields,summary_ar:'وصف جديد'};
  assert.deepEqual(await post(scope,'save',COURSE,1,edit), {
    outcome:'saved',courseId:COURSE,version:2,status:'draft',
  });
  assert.equal((await post(scope,'publish',COURSE,2,fields)).outcome,'not-ready');
  assert.deepEqual(await post(scope,'publish',COURSE,2,edit), {
    outcome:'published',courseId:COURSE,version:3,status:'published',
  });
  assert.equal((await get(scope)).status,'published');
  assert.equal((await post(scope,'save',COURSE,3,edit)).outcome,'immutable');
  assert.equal((await post(scope,'publish',COURSE,3,edit)).outcome,'immutable');
  assert.equal(storage.count(),1);
});

test('no partial, empty or untranslated courses can be published', async () => {
  const s = store(), scope=host('site-a',s);
  const incomplete = {...fields,lesson_body_ar:'   '};
  assert.equal((await post(scope,'create',COURSE,0,incomplete)).outcome,'created');
  assert.equal((await post(scope,'publish',COURSE,1,incomplete)).outcome,'not-ready');
  assert.equal(s.snapshot(COURSE).fields.status,'draft');
  assert.equal((await post(scope,'save',COURSE,1,fields)).outcome,'saved');
  assert.equal((await post(scope,'publish',COURSE,2,fields)).outcome,'published');
});

test('rejects invalid identifiers, unsupported actions, stale versions and oversized content', async () => {
  const s=store(),scope=host('site-a',s);
  for(const id of ['../escape','a b','SELECT 1','UPPER','a']) {
    assert.equal((await post(scope,'create',id)).outcome,'invalid');
  }
  assert.equal((await post(scope,'create',COURSE,1)).outcome,'conflict');
  assert.equal((await post(scope,'delete')).outcome,'invalid');
  assert.equal((await post(scope,'create',COURSE,0,{...fields,title_en:'x'.repeat(181)})).outcome,'invalid');
  assert.equal(s.count(),0);
  assert.equal((await post(scope,'create')).outcome,'created');
  assert.equal((await post(scope,'create')).outcome,'conflict');
  assert.equal((await post(scope,'save',COURSE,9)).outcome,'conflict');
  assert.equal((await post(scope,'publish',COURSE,9)).outcome,'conflict');
  assert.equal(s.snapshot(COURSE).version,1);
});

test('publication and Staff access fail closed, without global memory or caller tenant selectors', async () => {
  const a=store(),b=store();
  const sa=host('publication-a',a),sb=host('publication-b',b);
  assert.equal((await post(sa,'create')).outcome,'created');
  assert.equal((await get(sb)).outcome,'empty');
  assert.equal((await post(sb,'save',COURSE,1)).outcome,'not-found');
  assert.equal(b.count(),0);
  for(const scope of [host('publication-a',null),host('publication-a',a,'member'),
    { publicationId:'',principal:{kind:'staff',id:'staff-1'},storage:a }]) {
    assert.equal((await get(scope)).outcome,'unavailable');
    assert.equal((await post(scope,'create')).outcome,'unavailable');
  }
  assert.equal((await post(sa,'create',COURSE,0,{...fields,publicationId:'publication-b'})).outcome,'conflict');
  assert.equal(a.count(),1);
  assert.equal(b.count(),0);
});

test('concurrent creates and updates obey Host uniqueness and CAS', async () => {
  const s=store(),scope=host('publication-a',s);
  const creates=await Promise.all(Array.from({length:8},()=>post(scope,'create')));
  assert.equal(creates.filter(x=>x.outcome==='created').length,1);
  assert.equal(creates.filter(x=>x.outcome==='conflict').length,7);
  const writes=await Promise.all(Array.from({length:8},()=>post(scope,'save',COURSE,1,fields)));
  assert.equal(writes.filter(x=>x.outcome==='saved').length,1);
  assert.equal(writes.filter(x=>x.outcome==='conflict').length,7);
  assert.equal(s.snapshot(COURSE).version,2);
});

test('unsigned authoring candidate contains bounded and consistent operator artifacts', async () => {
  const root=new URL('../dist/authoring-release/',import.meta.url);
  const lock=JSON.parse(await readFile(new URL('trusted-plugins.json',root),'utf8'));
  const plan=JSON.parse(await readFile(new URL('operator-migration-plan.json',root),'utf8'));
  const moduleBytes=await readFile(new URL('vibress-lms-authoring.mjs',root));
  const htmlBytes=await readFile(new URL('courses.html',root));
  const sha=(x)=>createHash('sha256').update(x).digest('hex');
  const item=lock.plugins[0];
  assert.equal(item.manifest.id,'vibress-lms-authoring');
  assert.equal(item.manifest.vibressApiVersion,'1.0.0');
  assert.equal(item.sha256,sha(moduleBytes));
  assert.equal(item.adminUiAssets[0].viewId,'courses');
  assert.equal(item.adminUiAssets[0].sha256,sha(htmlBytes));
  assert.equal(item.storageModels.length, 3);
  assert.equal(item.storageModels[0].key, 'courses');
  assert.equal(item.storageModels[1].key, 'enrollments');
  assert.equal(item.storageModels[2].key, 'completions');
  assert.equal(plan.migrationId, '0001_lms_authoring');
  assert.equal(plan.artifactSha256, item.sha256);
  assert.equal(plan.migrationSha256, sha(JSON.stringify(plan.models.map(m => ({
    key: m.key, schemaSha256: m.schemaSha256,
  })))));
  for(const m of plan.models) assert.equal(m.schemaSha256, sha(JSON.stringify(m.columns)));
  assert.deepEqual(item.manifest.capabilities, [
    'extension.routes.admin', 'extension.storage.read', 'extension.storage.write', 'admin.navigation',
    'extension.routes.public', 'extension.routes.member', 'extension.member_storage.read', 'extension.member_storage.write',
  ]);
  assert.equal(htmlBytes.includes(Buffer.from('https://')),false);
});
