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
    const sandbox = {Buffer, console, process:{env:{ZSHELF_DL_TMP:path.join(scratch,'stage')}}, module:{exports:{}}, require(name) {
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
