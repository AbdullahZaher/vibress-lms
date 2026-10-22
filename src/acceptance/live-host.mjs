/**
 * EXT-502: external Host acceptance over real HTTP boundaries.
 * Only public API calls. No DB access, private Host imports, or test bypasses.
 */
const PLUGIN_ID = 'vibress-lms-pilot';
const COURSE_ID = 'pilot-foundations';
const LESSON_ID = 'welcome';
const expectedDenied = new Set([401, 403, 404]);

export function validateConfiguration(config) {
  if (!config || typeof config !== 'object') throw new Error('Missing acceptance configuration');
  const origins = {};
  for (const key of ['siteA', 'siteB']) {
    const value = config[key];
    if (typeof value !== 'string') throw new Error(`Missing ${key} origin`);
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`Invalid ${key} origin`);
    }
    const loopback = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (!loopback && !(config.allowRemote === true && url.protocol === 'https:')) {
      throw new Error(`${key} must use loopback, or explicitly approved HTTPS staging`);
    }
    origins[key] = url.origin;
  }
  if (origins.siteA === origins.siteB) throw new Error('Two distinct publication origins required');
  const cookies = {};
  for (const key of ['cookieA1', 'cookieA2', 'cookieB1']) {
    const value = config[key];
    if (typeof value !== 'string' || value.length < 3 || value.length > 8192 ||
        /[\r\n\u0000]/.test(value) || !value.includes('=')) {
      throw new Error(`Invalid ${key} credential`);
    }
    cookies[key] = value;
  }
  if (new Set(Object.values(cookies)).size !== 3) {
    throw new Error('Distinct test Member sessions required');
  }
  return { ...origins, ...cookies, allowWrites: config.allowWrites === true };
}

function assertMatch(value, expected, description) {
  if (value !== expected) throw new Error(`Host acceptance mismatch: ${description}`);
}

/** Never follow a redirect while holding a Member credential. */
async function request(origin, cookie, method, pathname, body, requestOrigin = origin) {
  const headers = { accept: 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (method === 'POST') {
    headers.origin = requestOrigin;
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(new URL(pathname, origin), {
    method, headers, redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  if (response.status !== 200) return { status: response.status };
  const value = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Host returned malformed JSON');
  }
  return { status: 200, data: value };
}

const memberPath = (name, query) =>
  `/api/members/v1/extensions/${PLUGIN_ID}/v1/${name}${query ? `?${new URLSearchParams(query)}` : ''}`;
const catalogPath = (locale) =>
  `/api/content/v1/extensions/${PLUGIN_ID}/views/catalog/page?locale=${locale}`;

function requireResult(result, expected, name) {
  assertMatch(result.status, 200, `${name} status`);
  assertMatch(result.data?.outcome, expected, `${name} outcome`);
  return result.data;
}
function requireDenied(result, name) {
  if (!expectedDenied.has(result.status)) throw new Error(`${name} was not denied`);
}

/**
 * Requires three fresh test Member sessions: A1, A2 (same site), B1 (other site).
 * Read-only checks run by default. Writes require an explicit opt-in.
 */
export async function verifyLiveHost(raw) {
  const c = validateConfiguration(raw);
  const scope = [
    { origin: c.siteA, cookie: c.cookieA1 },
    { origin: c.siteA, cookie: c.cookieA2 },
    { origin: c.siteB, cookie: c.cookieB1 },
  ];
  for (const [site, origin] of [['A', c.siteA], ['B', c.siteB]]) {
    for (const language of ['en', 'ar']) {
      const page = await request(origin, null, 'GET', catalogPath(language));
      assertMatch(page.status, 200, `publication ${site} ${language} catalog`);
      assertMatch(page.data?.publicationId ? typeof page.data.publicationId : 'absent',
        'string', `publication ${site} Host-bound ID`);
      assertMatch(page.data?.data?.outcome, 'published', `${site} ${language} published`);
      assertMatch(page.data?.data?.courseId, COURSE_ID, `${site} ${language} course`);
      assertMatch(page.data?.data?.locale, language, `${site} ${language} locale`);
      if (Object.hasOwn(page.data.data, 'body') || Object.hasOwn(page.data.data, 'memberId')) {
        throw new Error('Private lesson or Member data leaked in public catalog');
      }
    }
  }
  // Authentication, independent Host publication resolution and Origin guards.
  requireDenied(await request(c.siteA, null, 'GET', memberPath('progress', { courseId: COURSE_ID })),
    'Anonymous Member read');
  requireDenied(await request(c.siteB, c.cookieA1, 'GET', memberPath('progress', { courseId: COURSE_ID })),
    'Member A1 reused on site B');
  requireDenied(await request(c.siteA, c.cookieB1, 'GET', memberPath('progress', { courseId: COURSE_ID })),
    'Member B1 reused on site A');

  // Fresh-member baseline. A real test should not run against pre-enrolled users.
  for (const [i, member] of scope.entries()) {
    const prior = await request(member.origin, member.cookie, 'GET',
      memberPath('progress', { courseId: COURSE_ID }));
    requireResult(prior, 'not-authorized', `Member ${i + 1} initially unenrolled`);
  }
  // A non-enrolled Member must not read protected lesson text.
  const deniedLesson = await request(c.siteA, c.cookieA1, 'GET', memberPath('lesson', {
    courseId: COURSE_ID, lessonId: LESSON_ID, locale: 'en',
  }));
  requireResult(deniedLesson, 'not-found', 'Unenrolled lesson access');
  if (!c.allowWrites) return { mode: 'read-only', sites: 2, sessions: 3 };

  const enroll = memberPath('enroll');
  requireResult(await request(c.siteA, c.cookieA1, 'POST', enroll,
    { courseId: COURSE_ID, locale: 'ar' }), 'created', 'Fresh enrollment');
  requireResult(await request(c.siteA, c.cookieA1, 'POST', enroll,
    { courseId: COURSE_ID, locale: 'en' }), 'already-enrolled', 'Idempotent enrollment');
  const languageLesson = await request(c.siteA, c.cookieA1, 'GET', memberPath('lesson', {
    courseId: COURSE_ID, lessonId: LESSON_ID, locale: 'ar',
  }));
  const lesson = requireResult(languageLesson, 'allowed', 'Protected Arabic lesson');
  if (typeof lesson.body !== 'string' || !lesson.body) {
    throw new Error('Authorized lesson body missing');
  }
  const first = requireResult(await request(c.siteA, c.cookieA1, 'GET',
    memberPath('progress', { courseId: COURSE_ID })), 'available', 'Progress before completion');
  assertMatch(first.completed, 0, 'Progress before completion');
  const completion = memberPath('complete');
  // Wrong Origin must not authorize a mutation, even for an authenticated Member.
  requireDenied(await request(c.siteA, c.cookieA1, 'POST', completion,
    { courseId: COURSE_ID, lessonId: LESSON_ID, locale: 'ar' }, c.siteB), 'CSRF Origin mismatch');
  requireResult(await request(c.siteA, c.cookieA1, 'POST', completion,
    { courseId: COURSE_ID, lessonId: LESSON_ID, locale: 'ar' }), 'completed', 'Lesson completion');
  requireResult(await request(c.siteA, c.cookieA1, 'POST', completion,
    { courseId: COURSE_ID, lessonId: LESSON_ID, locale: 'en' }), 'already-completed', 'Idempotent completion');
  const progress = requireResult(await request(c.siteA, c.cookieA1, 'GET',
    memberPath('progress', { courseId: COURSE_ID })), 'available', 'Updated progress');
  assertMatch(progress.required, 2, 'Required lessons');
  assertMatch(progress.completed, 1, 'Completed lesson count');
  assertMatch(progress.percent, 50, 'Completion percentage');
  for (const [i, member] of scope.slice(1).entries()) {
    const data = await request(member.origin, member.cookie, 'GET',
      memberPath('progress', { courseId: COURSE_ID }));
    requireResult(data, 'not-authorized', `Other Member ${i + 1} isolation`);
    const privateLesson = await request(member.origin, member.cookie, 'GET',
      memberPath('lesson', { courseId: COURSE_ID, lessonId: LESSON_ID, locale: 'ar' }));
    requireResult(privateLesson, 'not-found', `Other Member ${i + 1} protected lesson`);
  }
  return { mode: 'write', sites: 2, sessions: 3, completedLessons: progress.completed };
}
