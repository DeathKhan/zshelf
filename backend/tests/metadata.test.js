const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
function load(fetchWithRetry = async () => ({ ok: true, status: 204 })) {
    const sandbox = {module: {exports: {}}, URL, require(name) {
        if (name === './common') return { domain: 'https://fixture.invalid', fetchOptions: {}, fetchWithRetry };
        if (name === './detail-cache') return require('../detail-cache');
        if (name === './list') return {approvedCached: () => false};
        return require(name);
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../metadata.js'), 'utf8'), sandbox);
    return sandbox.module.exports;
}
test('metadata excludes hidden category tree and keeps authors and useful facts', () => {
    const result = load().parseMetadata(`<h1>Pride &amp; Prejudice</h1><i class="authors">Jane Austen</i>
    <div class="bookDetailsBox">
      <div class="bookProperty"><div class="property_label">Categories:</div><div class="property_value">${'taxonomy '.repeat(30000)}</div></div>
      <div class="bookProperty"><div class="property_label">Year:</div><div class="property_value">1813</div></div>
    </div><div id="bookDescriptionBox">A &lt;classic&gt;.<script>unwanted()</script></div>`);
    assert.equal(result.author, 'Jane Austen');
    assert.ok(result.description.includes('1813'));
    assert.ok(result.description.includes('&lt;classic&gt;'));
    assert.ok(!result.description.includes('taxonomy'));
    assert.ok(!result.description.includes('unwanted'));
    assert.ok(result.description.length < 200);
});
test('empty live detail response ends once with a recoverable error', async () => {
    let text = '', ends = 0;
    await load()(['/book/1'], { write(value) {text += value;}, end() {ends++;} });
    assert.match(text, /^ERR: Book details are unavailable/);
    assert.equal(ends, 1);
});

test('opening cached details reuses the fetched page without a second network request', async () => {
    let calls = 0;
    const metadata = load(async () => { calls++; return {ok:true, status:200, text:async()=>'<h1>Cached book</h1>'}; });
    for (let i = 0; i < 2; i++) {
        let text = '';
        await metadata(['/book/cache-test'], {write(value){text+=value;}, end(){}});
        assert.equal(JSON.parse(text).name, 'Cached book');
    }
    assert.equal(calls, 1);
});

test('download link is the addDownloadedBook control, not the first decoy /dl/ anchor', () => {
    const result = load().parseMetadata(`<h1>Pride and Prejudice</h1><i class="authors">Jane Austen</i>
      <a href="/dl/decoy204"></a>
      <a class="btn btn-primary dlButton reader-link" href="https://reader.example/read">Read Online</a>
      <a class="btn btn-default dlButton addDownloadedBook" href="/dl/realepub">epub, 641 KB</a>
      <a href="/dl/otherdecoy"></a>`);
    assert.equal(result.dlUrl, '/dl/realepub');
});

test('pdf and epub buttons stay tied to the format that was picked', () => {
    const html = `<h1>Example</h1><i class="authors">Anon</i>
      <div class="bookProperty"><div class="property_label">File:</div><div class="property_value">PDF, 1.19 MB</div></div>
      <a href="/dl/decoy204"></a>
      <a class="btn btn-default dlButton addDownloadedBook" href="/dl/epubfile">epub, 400 KB</a>
      <a class="btn btn-default dlButton addDownloadedBook" href="/dl/pdffile">pdf, 1.19 MB</a>`;
    const api = load();
    assert.equal(api.parseMetadata(html).dlUrl, '/dl/pdffile');
    assert.equal(api.parseMetadata(html, 'pdf').dlUrl, '/dl/pdffile');
    assert.equal(api.parseMetadata(html, 'epub').dlUrl, '/dl/epubfile');
    assert.equal(api.parseMetadata(html, 'mobi').dlUrl, '');
});
