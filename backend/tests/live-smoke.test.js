const { test } = require("node:test");
const assert = require("node:assert");

// Hits the live mirror with no credentials. Proves the SHA-1 clearance
// cookie is accepted and the HTML is the real catalog, not the 503 page.
test("live zlib.bz search clears the browser check", { timeout: 60000 }, async () => {
    const common = require("../common");
    assert.strictEqual(common.domain, "https://zlib.bz");
    const res = await common.fetchWithRetry(common.domain + "/s/python");
    const html = await res.text();
    assert.strictEqual(res.status, 200);
    assert.ok(!html.includes("Checking your browser"), "still on the challenge page");
    assert.ok(html.includes("z-bookcard"), "search HTML has no z-bookcard");
    assert.ok(common.jar.get("c_token"), "clearance cookie was not kept");
    assert.ok(common.jar.get("bsrv"), "bsrv cookie was not kept");
});
