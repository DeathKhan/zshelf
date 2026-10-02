const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

async function info(profile, historyFails = false) {
    const sandbox = { module: { exports: {} }, require(name) {
        if (name === 'cheerio') return { load: () => () => ({ length: 0 }) };
        if (name === './common') return {
            domain: 'https://fixture.invalid', fetchOptions: {},
            fetchWithRetry: async url => {
                if (url.includes('/papi/')) {
                    if (profile instanceof Error) throw profile;
                    return { json: async () => profile };
                }
                if (historyFails) throw new Error('History failed');
                return { text: async () => '' };
            }
        };
        throw new Error(name);
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../info.js'), 'utf8'), sandbox);
    let body = '', ends = 0;
    await new Promise(resolve => sandbox.module.exports([], {
        write(text) { assert.equal(ends, 0, 'must not write after ending socket'); body += text; },
        end() { ends++; resolve(); }
    }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ends, 1);
    return JSON.parse(body);
}

test('quota survives history failure', async () => {
    const result = await info({ dailyDownloads: 3, dailyDownloadsLimit: 10 }, true);
    assert.equal(result.today_download, '3/10');
    assert.deepEqual(result.today_list, []);
});
test('failed or missing quota is unknown, never zero usage', async () => {
    for (const profile of [new Error('Quota failed'), {}, null]) {
        assert.equal((await info(profile)).today_download, '?/?');
    }
});
test('zero and exhausted limits are retained', async () => {
    assert.equal((await info({ dailyDownloads: 0, dailyDownloadsLimit: 10 })).today_download, '0/10');
    assert.equal((await info({ dailyDownloads: 10, dailyDownloadsLimit: 10 })).today_download, '10/10');
});
