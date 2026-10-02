const crypto = require("crypto");

// zlib.bz (and the same front on z-lib.bz) answers HTML with HTTP 503 and a
// short SHA-1 proof-of-work. A browser runs it, then reloads with c_token and
// c_time plus the bsrv cookie from Set-Cookie. No DOM, canvas, or WebDriver
// is required, so Node can do the same work.
function solveClearance(html) {
    const text = String(html || "");
    if (text.indexOf("Checking your browser") === -1 && text.indexOf("c_token=") === -1) {
        return null;
    }
    const arrM = text.match(/const a0_0x2a54=\[(.*?)\];/);
    if (!arrM) return null;
    const items = [];
    const itemRe = /'([^']*)'/g;
    let m;
    while ((m = itemRe.exec(arrM[1]))) items.push(m[1]);
    if (!items.length) return null;

    const rotM = text.match(/\}\(a0_0x2a54,(0x[0-9a-fA-F]+|\d+)\)\)/);
    const rot = rotM ? Number(rotM[1]) : 0;
    const n = items.length;
    for (let i = 0; i < (rot % n); i++) items.push(items.shift());

    const cM = text.match(/let c=a0_0x4457\('([^']+)'\)/);
    const idx = cM ? parseInt(cM[1], 16) : 2;
    const prefix = items[idx];
    const cond = text.match(/s\[n1\]===0x([0-9a-fA-F]+)\)&&\(s\[n1\+0x1\]===0x([0-9a-fA-F]+)\)/);
    if (!prefix || !cond) return null;

    const b0 = parseInt(cond[1], 16);
    const b1 = parseInt(cond[2], 16);
    const n1 = parseInt(prefix[0], 16);
    const started = Date.now();
    for (let i = 0; i < 3000000; i++) {
        const dig = crypto.createHash("sha1").update(prefix + String(i)).digest();
        if (dig[n1] === b0 && dig[n1 + 1] === b1) {
            const elapsed = Math.max((Date.now() - started) / 1000, 0.05);
            return { c_token: prefix + String(i), c_time: elapsed.toFixed(3) };
        }
    }
    return null;
}

module.exports = { solveClearance };
