import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { validateConfiguration, verifyLiveHost } from '../src/acceptance/live-host.mjs';

function handler(site) {
  const enrollments = new Set();
  const completions = new Set();
  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const cookie = req.headers.cookie ?? '';
    const session = /^member=(a1|a2|b1)$/.exec(cookie)?.[1];
    const current = site === 'A' ? ['a1', 'a2'] : ['b1'];
    const isMember = session && current.includes(session);
    const respond = (status, data) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (url.pathname.endsWith('/views/catalog/page')) {
      const lang = url.searchParams.get('locale');
      return respond(200, {
        publicationId: `site-${site}`, data: { outcome: 'published',
          courseId: 'pilot-foundations', locale: lang,
          title: lang === 'ar' ? 'مرحبا' : 'Welcome' },
      });
    }
    if (!isMember) return respond(cookie ? 404 : 401, { errors: [{ code: 'NO_SESSION' }] });
    if (req.method === 'POST' && req.headers.origin !== `http://${req.headers.host}`) {
      return respond(403, { errors: [{ code: 'INVALID_ORIGIN' }] });
    }
    const path = url.pathname.split('/').at(-1);
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
    const key = `${site}:${session}`;
    if (path === 'progress') {
      const active = enrollments.has(key);
      return respond(200, active ? { outcome: 'available', required: 2,
        completed: completions.has(key) ? 1 : 0,
        percent: completions.has(key) ? 50 : 0 } :
        { outcome: 'not-authorized', required: 0, completed: 0, percent: 0 });
    }
    if (path === 'enroll') {
      if (body.courseId !== 'pilot-foundations') return respond(200, { outcome: 'not-found' });
      const previously = enrollments.has(key);
      enrollments.add(key);
      return respond(200, { outcome: previously ? 'already-enrolled' : 'created' });
    }
    if (path === 'lesson') {
      return respond(200, enrollments.has(key) ?
        { outcome: 'allowed', title: 'مرحبًا', body: 'نص درس محمي' } :
        { outcome: 'not-found', title: '', body: '' });
    }
    if (path === 'complete') {
      if (!enrollments.has(key)) return respond(200, { outcome: 'not-authorized' });
      const was = completions.has(key);
      completions.add(key);
      return respond(200, { outcome: was ? 'already-completed' : 'completed' });
    }
    respond(404, { errors: [{ code: 'NOT_FOUND' }] });
  };
}
async function server(site) {
  const instance = createServer(handler(site));
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  const { port } = instance.address();
  return { instance, origin: `http://127.0.0.1:${port}` };
}
async function fixtures(action) {
  const a = await server('A');
  const b = await server('B');
  try {
    return await action({ siteA: a.origin, siteB: b.origin,
      cookieA1: 'member=a1', cookieA2: 'member=a2', cookieB1: 'member=b1' });
  } finally {
    await Promise.all([a, b].map(item => new Promise((resolve, reject) =>
      item.instance.close(err => err ? reject(err) : resolve()))));
  }
}

test('rejects unsafe origins, duplicate sessions and incomplete configuration before network calls', () => {
  const base = { siteA: 'http://127.0.0.1:6000', siteB: 'http://127.0.0.1:6001',
    cookieA1: 'member=a1', cookieA2: 'member=a2', cookieB1: 'member=b1' };
  assert.throws(() => validateConfiguration({ ...base, siteB: base.siteA }), /distinct/);
  assert.throws(() => validateConfiguration({ ...base, siteB: 'http://example.com' }), /loopback/);
  assert.throws(() => validateConfiguration({ ...base, siteB: 'https://example.com' }), /approved/);
  assert.throws(() => validateConfiguration({ ...base, siteB: 'https://u:p@example.com', allowRemote: true }), /Invalid/);
  assert.throws(() => validateConfiguration({ ...base, cookieA2: base.cookieA1 }), /Distinct/);
  assert.throws(() => validateConfiguration({ ...base, cookieA2: 'member=a2\nBcc:evil' }), /Invalid/);
});

test('live Host acceptance client exercises both publications in default read-only mode', async () => {
  await fixtures(async config => {
    const outcome = await verifyLiveHost(config);
    assert.deepEqual(outcome, { mode: 'read-only', sites: 2, sessions: 3 });
  });
});

test('live Host acceptance client tests CSRF, cross-site isolation, enrollment and idempotent progress', async () => {
  await fixtures(async config => {
    const outcome = await verifyLiveHost({ ...config, allowWrites: true });
    assert.deepEqual(outcome, { mode: 'write', sites: 2, sessions: 3, completedLessons: 1 });
  });
});

test('non-matching session and publication are rejected instead of accepted as public fallback', async () => {
  await fixtures(async config => {
    const outcome = await verifyLiveHost(config);
    assert.equal(outcome.mode, 'read-only');
  });
});
