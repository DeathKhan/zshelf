const { fetchWithRetry } = require("./common");

const MAX_BYTES = 4 * 1024 * 1024;
// A few result pages. Oldest covers drop out so a long browse does not grow without bound.
const MAX_CACHED = 48;

const cache = new Map();
const inflight = new Map();
let active = 0;
const waiting = [];
function schedule(fetch) {
    return new Promise((resolve, reject) => {
        const start = () => {
            active++;
            Promise.resolve().then(fetch).then(resolve, reject).finally(() => {
                active--;
                if (waiting.length) waiting.shift()();
            });
        };
        if (active < 4) start(); else waiting.push(start);
    });
}

const COVER_OPTS = {
    headers: { "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
};

function remember(url, buf) {
    if (cache.has(url)) cache.delete(url);
    cache.set(url, buf);
    while (cache.size > MAX_CACHED) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
}

// One download per URL. A second caller (Qt IMG, or a second prefetch) waits
// on the same promise instead of starting another request.
function loadCover(url) {
    const hit = cache.get(url);
    if (hit) {
        remember(url, hit);
        return Promise.resolve(hit);
    }
    const pending = inflight.get(url);
    if (pending) return pending;
    const job = schedule(async () => {
        const response = await fetchWithRetry(url, {...COVER_OPTS, timeout: 12000, size: MAX_BYTES});
        if (!response.ok) throw new Error("status");
        const buf = typeof response.buffer === "function"
            ? await response.buffer()
            : Buffer.from(await response.arrayBuffer());
        if (!buf || !buf.length || buf.length > MAX_BYTES) throw new Error("size");
        remember(url, buf);
        return buf;
    }).finally(() => {
        if (inflight.get(url) === job) inflight.delete(url);
    });
    inflight.set(url, job);
    return job;
}

// Queue covers with at most four transfers active. Callers must not await this
// before writing the list JSON. One failure does not cancel the others.
function prefetchCovers(urls) {
    const jobs = [];
    const seen = new Set();
    for (const raw of urls || []) {
        const url = String(raw || "").trim();
        if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
        seen.add(url);
        jobs.push(loadCover(url).catch(() => null));
    }
    if (jobs.length) Promise.all(jobs).catch(() => {});
    return jobs.length;
}

// Cover bytes go through fetchWithRetry. That keeps bsrv, c_token, and
// c_time in the shared jar and solves the browser check once per session,
// not once per image. This file does not solve the browser check itself. URLs and
// cookies are not logged.
async function fetchCover(args, socket) {
    const url = String((args && args[0]) || "").trim();
    if (!/^https?:\/\//i.test(url)) {
        socket.write("ERR: image\n");
        socket.end();
        return;
    }
    try {
        const buf = await loadCover(url);
        socket.write("IMG:" + buf.toString("base64") + "\n");
    } catch (err) {
        socket.write("ERR: image\n");
    }
    socket.end();
}

module.exports = fetchCover;
module.exports.prefetchCovers = prefetchCovers;
