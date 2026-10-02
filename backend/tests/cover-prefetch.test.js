const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const imagePath = path.join(__dirname, "../image.js");
const commonPath = path.join(__dirname, "../common.js");

function loadImage(fetchWithRetry) {
    const sandbox = {
        module: { exports: {} },
        Buffer,
        require(name) {
            if (name === "./common") return { fetchWithRetry };
            return require(name);
        },
    };
    vm.runInNewContext(fs.readFileSync(imagePath, "utf8"), sandbox, { filename: imagePath });
    return sandbox.module.exports;
}

test("image.js does not solve the browser check", () => {
    const src = fs.readFileSync(imagePath, "utf8");
    assert.equal(src.includes("solveClearance"), false);
});

test("cover concurrency is bounded and IMG joins the in-flight fetch", async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const png = Buffer.from("cover-bytes");
    const seen = [];
    const fetchCover = loadImage((url) => {
        calls++;
        seen.push(url);
        return gate.then(() => ({ ok: true, status: 200, buffer: async () => png }));
    });
    const urls = Array.from({ length: 12 }, (_, i) => "https://cdn.example/cover-" + i + ".jpg");
    const started = fetchCover.prefetchCovers(urls.concat([urls[0], "", "/relative.jpg", "not a url"]));
    assert.equal(started, 12);
    await Promise.resolve();
    assert.equal(calls, 4);
    assert.deepEqual(seen, urls.slice(0, 4));

    let text = "";
    const pending = fetchCover([urls[3]], {
        write(value) { text += value; },
        end() {},
    });
    assert.equal(calls, 4);
    release();
    await pending;
    assert.ok(text.startsWith("IMG:"));
    assert.equal(Buffer.from(text.slice(4).trim(), "base64").equals(png), true);

    await new Promise(resolve => setImmediate(resolve));
    text = "";
    await fetchCover([urls[3]], {
        write(value) { text += value; },
        end() {},
    });
    assert.equal(calls, 12);
    assert.ok(text.startsWith("IMG:"));
});

test("list JSON is written without waiting for cover downloads", () => {
    const image = require("../image");
    const events = [];
    image.prefetchCovers = (urls) => {
        events.push("prefetch:" + urls.length);
        return new Promise(() => {});
    };
    const { emitBooks } = require("../list");
    const books = Array.from({ length: 12 }, (_, i) => ({
        img: "https://cdn.example/page-" + i + ".jpg",
        name: "Title " + i,
        url: "/book/" + i,
    }));
    emitBooks({
        write(value) {
            events.push(value.startsWith("[") ? "json" : "other");
        },
        end() { events.push("end"); },
    }, books);
    assert.deepEqual(events, ["prefetch:12", "json", "end"]);
});

test("a burst of 503s solves the browser check once", async () => {
    let solves = 0;
    let firstWave = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });

    function fakeFetch(url, opts) {
        const cookie = (opts && opts.headers && opts.headers.Cookie) || "";
        const cleared = cookie.includes("c_token=");
        if (!cleared) firstWave++;
        return gate.then(() => {
            if (!cleared) {
                return {
                    status: 503,
                    ok: false,
                    headers: {
                        raw() { return { "set-cookie": [] }; },
                        get() { return null; },
                    },
                    text: async () => "Checking your browser",
                };
            }
            return {
                status: 200,
                ok: true,
                headers: {
                    raw() { return {}; },
                    get() { return null; },
                },
                text: async () => "ok",
            };
        });
    }

    const sandbox = {
        module: { exports: {} },
        require(name) {
            if (name === "node-fetch") return fakeFetch;
            if (name === "./clearance") {
                return {
                    solveClearance() {
                        solves++;
                        return { c_token: "once", c_time: "0.100" };
                    },
                };
            }
            if (name === "fs") {
                return { readFileSync() { return "{\"domain\":\"https://example.test\"}"; } };
            }
            return require(name);
        },
        process,
        Buffer,
        URL,
        setTimeout,
        clearTimeout,
        __dirname: path.join(__dirname, ".."),
        __filename: commonPath,
    };
    vm.runInNewContext(fs.readFileSync(commonPath, "utf8"), sandbox, { filename: commonPath });
    const { fetchWithRetry } = sandbox.module.exports;
    const urls = Array.from({ length: 12 }, (_, i) => "https://cdn.example/burst-" + i + ".jpg");
    const pending = Promise.all(urls.map((url) => fetchWithRetry(url, {
        headers: { "Accept": "image/*" },
    })));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(firstWave, 12);
    release();
    const results = await pending;
    assert.equal(solves, 1);
    assert.equal(results.every((res) => res.status === 200), true);
});
