const config = JSON.parse(require("fs").readFileSync(__dirname + "/../config.json"));
const fetch = require("node-fetch");

module.exports.fetchOptions = {
    headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

/**
 * Same as fetch() but retries on temporary DNS/network errors (e.g. EAI_AGAIN).
 */
module.exports.fetchWithRetry = function (url, options, retriesLeft = MAX_RETRIES) {
    return fetch(url, options).catch((err) => {
        const code = err.code || (err.cause && err.cause.code);
        if (retriesLeft > 0 && code && RETRYABLE_CODES.has(code)) {
            return sleep(RETRY_DELAY_MS).then(() =>
                module.exports.fetchWithRetry(url, options, retriesLeft - 1)
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
module.exports.domain = normalizeDomain(config.domain);
module.exports.listURL = config.listURL;
module.exports.additionalBookLocation = config.additionalBookLocation;