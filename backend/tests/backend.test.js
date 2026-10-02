const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "browser-check.html"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zshelf-test-"));
const cfgPath = path.join(tmp, "config.json");
const xochitl = path.join(tmp, "xochitl");
const books = path.join(tmp, "books");
fs.mkdirSync(xochitl);

let base;
let server;
let seen = { loginBody: "", cookie: "" };

function cardHtml() {
    return `<html><body>
<div class="totalCounter">(12)</div>
<div class="resItemBoxBooks">
  <z-bookcard href="/book/abc/sample.html">
    <img src="https://cdn.example/cover.jpg">
    <span slot="title">Sample Title</span>
    <span slot="author">Sample Author</span>
  </z-bookcard>
</div>
</body></html>`;
}

before(async () => {
    server = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            const cookie = req.headers.cookie || "";
            if (req.url.startsWith("/challenge")) {
                if (!cookie.includes("c_token=")) {
                    res.setHeader("Set-Cookie", "bsrv=test-bsrv; path=/");
                    res.writeHead(503, { "Content-Type": "text/html;charset=utf-8" });
                    res.end(fixture);
                    return;
                }
                seen.cookie = cookie;
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end("<html><title>cleared</title>z-bookcard</html>");
                return;
            }
            if (req.url.startsWith("/book/")) {
                res.end('<div class="property_label">Categories:</div><div class="property_value"><a>Science</a></div>');
                return;
            }
            if (req.url.startsWith("/s/server-error/")) {
                res.writeHead(502); res.end("temporarily unavailable"); return;
            }
            if (req.url.startsWith("/s/")) {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(cardHtml());
                return;
            }
            if (req.url.startsWith("/papi/user/dstats")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ dailyDownloads: 2, dailyDownloadsLimit: 10 }));
                return;
            }
            if (req.url.startsWith("/users/dstats.php")) {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end('<div class="dstats-row"><a href="/book/hist">History Book</a></div>');
                return;
            }
            if (req.url.startsWith("/dl/")) {
                const payload = Buffer.from("file-bytes");
                const headers = {
                    "Content-Length": String(payload.length),
                };
                if (req.url.startsWith("/dl/unquoted")) {
                    headers["Content-Type"] = "application/epub+zip";
                    headers["Content-Disposition"] = "attachment; filename=Narnia_2014.epub";
                } else if (req.url.startsWith("/dl/star")) {
                    headers["Content-Type"] = "application/epub+zip";
                    headers["Content-Disposition"] = "attachment; filename*=UTF-8''Narnia%20Collection.epub";
                } else if (req.url.startsWith("/dl/plain")) {
                    headers["Content-Type"] = "application/pdf";
                } else {
                    headers["Content-Type"] = "application/octet-stream";
                    headers["Content-Disposition"] = 'attachment; filename="Hello (z-lib.sk).epub"';
                }
                res.writeHead(200, headers);
                res.end(payload);
                return;
            }
            if (req.url.startsWith("/eapi/user/login") && req.method === "POST") {
                seen.loginBody = body;
                res.setHeader("Set-Cookie", [
                    "remix_userid=12345; path=/",
                    "remix_userkey=abc-key; path=/",
                    "other=ignore; path=/",
                ]);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: 1 }));
                return;
            }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<html>home</html>");
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = "http://127.0.0.1:" + server.address().port;
    fs.writeFileSync(cfgPath, JSON.stringify({
        domain: base,
        cookie: "",
        additionalBookLocation: books,
        defaultQuery: {
            exactMatch: "0", fromYear: "2020", toYear: "2026",
            language: "English", extension: "epub", order: "Most Popular", query: ""
        }
    }, null, 4));
    process.env.ZSHELF_CONFIG = cfgPath;
    process.env.ZSHELF_XOCHITL = xochitl + "/";
    process.env.ZSHELF_DL_TMP = path.join(tmp, "dl");
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
});

function sock() {
    let done;
    const result = new Promise((resolve) => { done = resolve; });
    return {
        result,
        chunks: [],
        write(s) { this.chunks.push(String(s)); },
        end() { done(this.chunks.join("")); },
    };
}

test("domain rewrite sends stale z-lib hosts to zlib.bz", () => {
    const { normalizeDomain } = require("../common");
    assert.strictEqual(normalizeDomain("https://z-lib.fm/x"), "https://zlib.bz");
    assert.strictEqual(normalizeDomain("https://z-lib.sk"), "https://zlib.bz");
    assert.strictEqual(normalizeDomain("https://zlib.bz/"), "https://zlib.bz");
    assert.strictEqual(normalizeDomain("not a url"), "https://zlib.bz");
});

test("browser check solver yields a c_token that matches the script", () => {
    const crypto = require("crypto");
    const { solveClearance } = require("../clearance");
    const solved = solveClearance(fixture.toString("utf8"));
    assert.ok(solved && solved.c_token && solved.c_time);
    const prefix = solved.c_token.replace(/[0-9]+$/, "");
    const i = solved.c_token.slice(prefix.length);
    const dig = crypto.createHash("sha1").update(prefix + i).digest();
    const n1 = parseInt(prefix[0], 16);
    assert.strictEqual(dig[n1], 0xb0);
    assert.strictEqual(dig[n1 + 1], 0x0b);
});

test("fetch keeps bsrv and c_token and retries past the 503", async () => {
    const common = require("../common");
    const res = await common.fetchWithRetry(base + "/challenge");
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.match(text, /cleared/);
    assert.ok(common.jar.get("bsrv"));
    assert.ok(common.jar.get("c_token"));
    assert.match(seen.cookie, /c_token=/);
    assert.match(seen.cookie, /bsrv=/);
});

test("list parses z-bookcard html", async () => {
    const { getList } = require("../list");
    const s = sock();
    getList(["0", "2020", "2026", "English", "epub", "Most Popular", "sample", "1"], s);
    const out = await s.result;
    assert.match(out, /TOTAL:12/);
    const line = out.trim().split("\n").filter(line => line.startsWith("[")).pop();
    const books = JSON.parse(line);
    assert.strictEqual(books[0].name, "Sample Title");
    assert.strictEqual(books[0].author, "Sample Author");
    assert.strictEqual(books[0].url, "/book/abc/sample.html");
    assert.strictEqual(books[0].img, "https://cdn.example/cover.jpg");
});

test("info reads download stats and history rows", async () => {
    const info = require("../info");
    const s = sock();
    info([], s);
    const out = await s.result;
    const json = JSON.parse(out.trim().split("\n").pop());
    assert.strictEqual(json.today_download, "2/10");
    assert.strictEqual(json.today_list[0].name, "History Book");
    assert.strictEqual(json.today_list[0].url, "/book/hist");
});

test("download stores the file from a mocked response and strips the mirror tag", async () => {
    const download = require("../download");
    const s = sock();
    download(["/dl/fake"], s);
    const out = await s.result;
    assert.match(out, /STATE:Saving/);
    assert.match(out, /DONE:/);
    assert.match(out, /PROG:100/);
    const saved = fs.readdirSync(books);
    assert.ok(saved.some((name) => name === "Hello.epub"));
    assert.ok(!saved.some((name) => name.includes("z-lib")));
});

test("login stores remix cookies from Set-Cookie and does not store the password", async () => {
    const login = require("../login");
    const s = sock();
    const email = "reader@example.com";
    const password = "not-the-real-password";
    await login(email, password, s);
    const out = await s.result;
    assert.strictEqual(out.trim(), "OK");
    assert.match(seen.loginBody, /email=reader%40example.com/);
    assert.match(seen.loginBody, /password=not-the-real-password/);
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    assert.match(cfg.cookie, /remix_userid=12345/);
    assert.match(cfg.cookie, /remix_userkey=abc-key/);
    assert.ok(!cfg.cookie.includes("not-the-real-password"));
    assert.ok(!fs.readFileSync(cfgPath, "utf8").includes("not-the-real-password"));
    assert.ok(!cfg.cookie.includes("other="));
});

test("download accepts an unquoted filename and still writes progress", async () => {
    const download = require("../download");
    const s = sock();
    download(["/dl/unquoted"], s);
    const out = await s.result;
    assert.ok(!out.includes("ERR: 2 No file"));
    assert.match(out, /PROG:/);
    assert.match(out, /STATE:Saving/);
    assert.match(out, /DONE:/);
    assert.ok(fs.readdirSync(books).includes("Narnia_2014.epub"));
});

test("download accepts filename star and a title fallback", async () => {
    const download = require("../download");
    const star = sock();
    download(["/dl/star"], star);
    const starOut = await star.result;
    assert.ok(!starOut.includes("ERR: 2 No file"));
    assert.match(starOut, /PROG:100/);
    assert.ok(fs.readdirSync(books).includes("Narnia Collection.epub"));

    const plain = sock();
    download(["/dl/plain/file", "Chronicles of Narnia"], plain);
    const plainOut = await plain.result;
    assert.ok(!plainOut.includes("ERR: 2 No file"));
    assert.match(plainOut, /PROG:/);
    assert.match(plainOut, /STATE:Saving/);
    assert.ok(fs.readdirSync(books).includes("Chronicles of Narnia.pdf"), JSON.stringify(fs.readdirSync(books)));
});

test("catalog failures are retryable errors, not exhausted searches", async () => {
    const {getList} = require("../list");
    const response = sock();
    getList(["0","Any","Any","English","Any","Best Match","server-error","1","0"], response);
    const out = await response.result;
    assert.match(out, /ERR:.*Catalog request failed/);
    assert.ok(!out.includes('END:'));
});
