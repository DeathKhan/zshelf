const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function load(fetchWithRetry) {
    const sandbox = { module: { exports: {} }, Buffer, require(name) {
        if (name === './common') return { fetchWithRetry };
        return require(name);
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../image.js'), 'utf8'), sandbox);
    return sandbox.module.exports;
}

test('cover fetch uses the clearance client and returns bytes without echoing the url', async () => {
    let seen = null;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fetchCover = load(async (url) => {
        seen = url;
        return { ok: true, status: 200, buffer: async () => png };
    });
    let text = '';
    let ends = 0;
    await fetchCover(['https://example.test/cover.jpg'], {
        write(value) { text += value; },
        end() { ends++; },
    });
    assert.equal(seen, 'https://example.test/cover.jpg');
    assert.equal(ends, 1);
    assert.ok(text.startsWith('IMG:'));
    assert.equal(Buffer.from(text.slice(4).trim(), 'base64').equals(png), true);
    assert.ok(!text.includes('example.test'));
});

test('rejected cover does not include the url', async () => {
    const fetchCover = load(async () => { throw new Error('https://secret.example/cover?token=nope'); });
    let text = '';
    await fetchCover(['https://secret.example/cover?token=nope'], {
        write(value) { text += value; },
        end() {},
    });
    assert.equal(text, 'ERR: image\n');
    assert.ok(!text.includes('secret'));
    assert.ok(!text.includes('token'));
});
