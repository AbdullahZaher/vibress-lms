/** Run against operator-installed *test* publications; no credentials in argv/logs. */
import { verifyLiveHost } from '../src/acceptance/live-host.mjs';

try {
  const outcome = await verifyLiveHost({
    siteA: process.env.LMS_HOST_SITE_A,
    siteB: process.env.LMS_HOST_SITE_B,
    cookieA1: process.env.LMS_HOST_COOKIE_A1,
    cookieA2: process.env.LMS_HOST_COOKIE_A2,
    cookieB1: process.env.LMS_HOST_COOKIE_B1,
    allowWrites: process.env.LMS_HOST_ALLOW_WRITES === '1',
    allowRemote: process.env.LMS_HOST_ALLOW_REMOTE_STAGING === '1',
  });
  console.info(`Host acceptance passed (${outcome.mode}, ${outcome.sites} publications, ${outcome.sessions} test Members)`);
} catch (error) {
  // Error messages must not contain cookie values, request bodies or URLs.
  console.error('Host acceptance failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}
