const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {Readable, Writable} = require('stream');
async function transfer(body, failDisk = false, type = 'application/epub+zip') {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'shelf-download-test-'));
    let output = '', ends = 0;
    let done;
    const completed = new Promise(resolve=>{done=resolve;});
    const sandbox = {Buffer, console, setInterval, clearInterval, process:{env:{ZSHELF_DL_TMP:path.join(scratch,'stage')}}, module:{exports:{}}, require(name) {
        if (name === './common') return {domain:'https://catalog.example',fetchOptions:{}, additionalBookLocation:path.join(scratch,'books'),fetchWithRetry:async()=>({ok:true,status:200,body,headers:{get(key){return {'content-type':type,'content-disposition':'attachment; filename=test.epub'}[key];}}})};
        if (name === 'fs' && failDisk) return {...fs, createWriteStream:()=>new Writable({write(chunk, enc, callback){callback(Error('disk full'));}})};
        return require(name);
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../download.js'),'utf8'),sandbox);
    sandbox.module.exports(['/dl/test'],{write(value){output+=value;},end(){ends++;done();}});
    await completed;
    assert.equal(ends,1);
    assert.match(output,/ERR:/);
    assert.doesNotMatch(output,/DONE:|PROG:100/);
    assert.deepEqual(fs.readdirSync(path.join(scratch,'stage')),[]);
    fs.rmSync(scratch,{recursive:true,force:true});
}
test('transfer stream failures end once and remove staging files', async()=>{
    await transfer(Readable.from((async function*(){yield Buffer.from('partial');throw Error('connection lost');})()));
});
test('disk failure is recoverable instead of an unhandled stream error',async()=>{
    await transfer(Readable.from([Buffer.from('book')]),true);
});
test('an HTML error page is never acknowledged as a downloaded book',async()=>{
    await transfer(Readable.from([Buffer.from('<html>error</html>')]),false,'text/html');
});

async function finish(body, headers) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'shelf-download-test-'));
    let output = '', ends = 0;
    let done;
    const completed = new Promise(resolve=>{done=resolve;});
    const sandbox = {Buffer, console, setInterval, clearInterval, process:{env:{ZSHELF_DL_TMP:path.join(scratch,'stage')}}, module:{exports:{}}, require(name) {
        if (name === './common') return {domain:'https://catalog.example',fetchOptions:{}, additionalBookLocation:path.join(scratch,'books'),fetchWithRetry:async()=>({ok:true,status:200,body,headers:{get(key){return headers[key] || headers[key.toLowerCase()] || '';}}})};
        return require(name);
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../download.js'),'utf8'),sandbox);
    sandbox.module.exports(['/dl/test'],{write(value){output+=value;},end(){ends++;done();},once(){},removeListener(){}});
    await completed;
    const books = path.join(scratch,'books');
    const saved = fs.existsSync(books) ? fs.readdirSync(books) : [];
    fs.rmSync(scratch,{recursive:true,force:true});
    return {output, ends, saved};
}
test('a short close after the full file is not a failure', async () => {
    const payload = Buffer.from('PK\x03\x04full-book');
    const body = Readable.from((async function*(){ yield payload; throw Error('premature close'); })());
    const result = await finish(body, {
        'content-type': 'application/epub+zip',
        'content-disposition': 'attachment; filename=test.epub',
        'content-length': String(payload.length),
    });
    assert.equal(result.ends, 1);
    assert.match(result.output, /DONE:/);
    assert.match(result.output, /PROG:100/);
    assert.doesNotMatch(result.output, /ERR:/);
    assert.ok(result.saved.includes('test.epub'));
});
test('decoded gzip is not incomplete just because content-length is the wire size', async () => {
    const payload = Buffer.from('PK\x03\x04decoded-book');
    const result = await finish(Readable.from([payload]), {
        'content-type': 'application/epub+zip',
        'content-disposition': 'attachment; filename=test.epub',
        'content-encoding': 'gzip',
        'content-length': '4',
    });
    assert.equal(result.ends, 1);
    assert.match(result.output, /DONE:/);
    assert.doesNotMatch(result.output, /Incomplete file/);
    assert.ok(result.saved.includes('test.epub'));
});
