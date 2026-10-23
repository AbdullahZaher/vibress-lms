import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("LMS Admin list renders persisted titles and IDs as inert text", async () => {
  const html = await readFile(new URL("../assets/courses.html", import.meta.url), "utf8");
  assert.match(html, /titleCell\.textContent = titleText/);
  assert.match(html, /idCell\.textContent = c\.id/);
  assert.doesNotMatch(html, /tr\.innerHTML\s*=/);
  assert.doesNotMatch(html, /data-edit-id="\$\{/);
});
