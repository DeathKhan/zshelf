const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { solveClearance } = require("./clearance");

function configFile() {
    return process.env.ZSHELF_CONFIG || path.join(__dirname, "..", "config.json");
}

function ensureConfig() {
    const file = configFile();
    if (fs.existsSync(file)) return;
    const example = path.join(__dirname, "..", "config.example.json");
    fs.copyFileSync(example, file);
}

ensureConfig();
let config = JSON.parse(fs.readFileSync(configFile(), "utf8"));

function currentConfig() {
    try {
        config = JSON.parse(fs.readFileSync(configFile(), "utf8"));
    } catch (e) {
        // A settings save can be mid-write. Keep the last good config.
    }
    return config;
}

module.exports.configFile = configFile;
module.exports.browserUA = "Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

module.exports.fetchOptions = {
    headers: {
        "User-Agent": module.exports.browserUA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": config.cookie,
    },
    method: "GET",
    compress: true,
    redirect: "follow",
};

const RETRYABLE_CODES = new Set(["EAI_AGAIN", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"]);
const RETRY_DELAY_MS = 1500;
const MAX_RETRIES = 3;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// One solved browser check for the process. Later requests send the same
// bsrv, c_token, and c_time cookies instead of running the SHA-1 proof again.
const jarMap = new Map();
const jar = {
    get(name) { return jarMap.has(name) ? jarMap.get(name) : ""; },
    has(name) { return jarMap.has(name); },
    set(name, value) { jarMap.set(String(name), String(value)); },
    delete(name) { jarMap.delete(name); },
    header() {
        return Array.from(jarMap.entries()).map(([key, value]) => key + "=" + value).join("; ");
    },
};
module.exports.jar = jar;
module.exports.cookieHeader = function () { return jar.header(); };

function rememberCookies(header) {
    String(header || "").split(";").forEach((part) => {
        const eq = part.indexOf("=");
        if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    });
}
rememberCookies(config.cookie);

function cookieLines(response) {
    const headers = response && response.headers;
    if (!headers) return [];
    if (typeof headers.raw === "function") {
        const raw = headers.raw();
        const lines = raw["set-cookie"] || raw["Set-Cookie"] || [];
        return Array.isArray(lines) ? lines : [lines];
    }
    if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
    const single = typeof headers.get === "function" ? headers.get("set-cookie") : "";
    return single ? [single] : [];
}

function absorbSetCookie(response) {
    for (const line of cookieLines(response)) {
        rememberCookies(String(line).split(";")[0]);
    }
}

function withJar(options) {
    const headers = Object.assign({}, options && options.headers);
    const current = headers.Cookie || headers.cookie || "";
    rememberCookies(current);
    const merged = jar.header();
    if (merged) headers.Cookie = merged;
    delete headers.cookie;
    return Object.assign({}, options, { headers });
}

let clearanceTask = null;
function solveOnce(html) {
    if (jar.get("c_token")) return Promise.resolve();
    if (!clearanceTask) {
        clearanceTask = Promise.resolve().then(() => {
            const solved = solveClearance(html);
            if (!solved || !solved.c_token) throw new Error("browser check");
            jar.set("c_token", solved.c_token);
            if (solved.c_time != null) jar.set("c_time", solved.c_time);
        }).catch((err) => {
            clearanceTask = null;
            throw err;
        });
    }
    return clearanceTask;
}

function challenged(html) {
    const text = String(html || "");
    return text.indexOf("Checking your browser") !== -1 || text.indexOf("c_token=") !== -1;
}

/**
 * Same as fetch() but retries on temporary DNS/network errors (e.g. EAI_AGAIN).
 * A zlib 503 browser check is solved once and the cookies are reused.
 */
module.exports.fetchWithRetry = function (url, options, retriesLeft = MAX_RETRIES, cleared = false) {
    return fetch(url, withJar(options || {})).then(async (res) => {
        absorbSetCookie(res);
        if (!cleared && res.status === 503) {
            const html = await res.text();
            if (challenged(html)) {
                await solveOnce(html);
                return module.exports.fetchWithRetry(url, options, retriesLeft, true);
            }
        }
        return res;
    }).catch((err) => {
        const code = err.code || (err.cause && err.cause.code);
        if (retriesLeft > 0 && code && RETRYABLE_CODES.has(code)) {
            return sleep(RETRY_DELAY_MS).then(() =>
                module.exports.fetchWithRetry(url, options, retriesLeft - 1, cleared)
            );
        }
        return Promise.reject(err);
    });
};

// r/zlibrary access wiki lists z-lib.sk as a current mirror (Sep 2026).
// z-lib.fm was answering with a connection/login error in recent threads.
const DEFAULT_DOMAIN = "https://z-lib.sk";
const STALE_HOSTS = new Set(["z-lib.fm", "b-ok.global", "z-lib.org", "booksc.org"]);
function normalizeDomain(raw) {

    if (!raw || typeof raw !== "string") return DEFAULT_DOMAIN;
    try {
        const host = new URL(raw).hostname.toLowerCase();
        if (STALE_HOSTS.has(host)) return DEFAULT_DOMAIN;
        return raw.replace(/\/$/, "");
    } catch (e) {
        return DEFAULT_DOMAIN;
    }
}

// Read on each use so a settings save is picked up without restarting node.
module.exports.normalizeDomain = normalizeDomain;
Object.defineProperty(module.exports, "domain", {
    enumerable: true,
    get() { return normalizeDomain(currentConfig().domain); },
});
Object.defineProperty(module.exports, "listURL", {
    enumerable: true,
    get() { return currentConfig().listURL; },
});
Object.defineProperty(module.exports, "additionalBookLocation", {
    enumerable: true,
    get() { return currentConfig().additionalBookLocation; },
});
