const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
function load(fetchWithRetry) {
    const sandbox = {process:{env:{}}, __dirname:path.join(__dirname,'..'), module: {exports: {}}, console, URL, require(name) {
        if (name === './common') return {domain:'https://catalog.example', fetchOptions:{}, fetchWithRetry};
        if (name === './detail-cache') return {remember() {}};
        if (name === 'fs') return {existsSync: () => false};
        return require(name);
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../list.js'), 'utf8'), sandbox);
    return sandbox.module.exports;
}
const book = i => ({name: 'Title ' + i, url: '/book/' + i});
const category = value => `<div class="property_label">Categories:</div><div class="property_value"><a>${value}</a></div>`;
test('filter never emits blocked, unknown, failed, or unchecked books; caches checked decisions', async () => {
    let active = 0, peak = 0, calls = 0;
    const filter = load(async url => {
        calls++; active++; peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5)); active--;
        const id = Number(url.split('/').pop());
        if (id === 3) throw Error('offline');
        return {ok:true, status:200, text: async () => id === 2 ? '<html>No category</html>' : category(id === 1 ? 'Erotica' : 'Science')};
    });
    const batches = [];
    const pending = filter.filterBooks(Array.from({length:9}, (_,i) => book(i)), batch => batches.push(...batch));
    assert.equal(batches.length, 0, 'Unchecked book emitted before verification');
    const result = await pending;
    assert.deepEqual(Array.from(result, x => x.url), ['/book/0','/book/4','/book/5','/book/6','/book/7','/book/8']);
    assert.ok(peak <= 4);
    const before = calls;
    const cached = [];
    await filter.filterBooks([book(0),book(1)], batch => cached.push(...batch));
    assert.equal(calls, before, 'Cached approvals and exclusions should not fetch again');
    assert.deepEqual(cached.map(x=>x.url), ['/book/0']);
    await filter.filterBooks([book(2),book(3)]);
    assert.equal(calls, before + 2, 'Unknown/failed decisions must be retried, never cached as safe');
});
test('cancellation stops scheduling later batches', async () => {
    let calls = 0, cancelled = false;
    const filter = load(async () => {calls++; return {ok:true, text:async()=>category('Science')};});
    await filter.filterBooks(Array.from({length:20},(_,i)=>book(i)), () => {cancelled = true;}, () => cancelled);
    assert.equal(calls,4);
});

test('an approved result does not wait for a slow neighboring check', async () => {
    let release;
    const slow = new Promise(resolve => {release = resolve;});
    const filter = load(async url => {
        if (url.endsWith('/0')) await slow;
        return {ok:true, text:async()=>category('Science')};
    });
    const emitted = [];
    const pending = filter.filterBooks([book(0),book(1)], batch => emitted.push(...batch));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(emitted.map(x => x.url), ['/book/1']);
    release(); await pending;
    assert.deepEqual(emitted.map(x => x.url), ['/book/1','/book/0']);
});
test('source pagination ends on the final or empty page and recognizes a next link', () => {
    const {hasNextPage} = load();
    assert.equal(hasNextPage('pagesTotal: 3', 1, 50),true);
    assert.equal(hasNextPage('pagesTotal: 3', 3, 50),false);
    assert.equal(hasNextPage('pagesTotal: 3', 1, 0),false);
    assert.equal(hasNextPage('<a href="/s/?q=x&amp;page=2">Next</a>', 1, 4),true);
    assert.equal(hasNextPage('<a href="/s/?page=20">Other</a>', 1, 4),false);
});
