const fs = require("fs");
const path = require("path");
const common = require("./common");

function configFile() {
    return common.configFile();
}

function hasSession() {
    return common.jar.has("remix_userid") && common.jar.has("remix_userkey");
}

function sessionCookie() {
    return ["remix_userid", "remix_userkey"]
        .filter((name) => common.jar.has(name))
        .map((name) => name + "=" + common.jar.get(name))
        .join("; ");
}

async function request(url, options) {
    const res = await common.fetchWithRetry(url, {
        method: options.method || "GET",
        redirect: "manual",
        headers: Object.assign({
            "User-Agent": common.browserUA,
            "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
        }, options.headers || {}),
        body: options.body,
    });
    // Drain so a challenge replay or HTML page cannot stall the socket.
    if (typeof res.text === "function") {
        try { await res.text(); } catch (e) { /* body already consumed */ }
    }
    return res;
}

function saveSession() {
    const file = configFile();
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    cfg.domain = common.domain;
    // Password is never written. Only the two session cookies are stored.
    cfg.cookie = sessionCookie();
    fs.writeFileSync(file, JSON.stringify(cfg, null, 4) + "\n");
    common.fetchOptions.headers.Cookie = common.cookieHeader();
}

module.exports = async function login(email, password, socket) {
    const fail = (msg) => {
        socket.write("ERR: " + msg + "\n");
        socket.end();
    };
    if (!email || !password) {
        fail("Email and password are required");
        return;
    }
    common.jar.delete("remix_userid");
    common.jar.delete("remix_userkey");
    const origin = String(common.domain).replace(/\/$/, "");
    try {
        await request(origin + "/", { method: "GET" });
        const creds = new URLSearchParams({ email: email, password: password }).toString();
        let res = await request(origin + "/eapi/user/login", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: creds,
        });
        if (!hasSession()) {
            const classic = new URLSearchParams({
                email: email,
                password: password,
                action: "login",
                site_mode: "books",
                redirect: "1",
            }).toString();
            res = await request(origin + "/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": origin + "/login",
                },
                body: classic,
            });
        }
        if (!hasSession() && res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            if (loc) {
                const next = loc.startsWith("http") ? loc : origin + (loc.startsWith("/") ? loc : "/" + loc);
                await request(next, { method: "GET" });
            }
        }
        if (!hasSession()) {
            fail("Sign-in failed");
            return;
        }
        saveSession();
        require("./detail-cache").clear();
        socket.write("OK\n");
        socket.end();
    } catch (err) {
        fail("Sign-in failed");
    }
};
