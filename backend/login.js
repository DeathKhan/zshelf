const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const common = require("./common");

function configFile() {
    return path.join(__dirname, "..", "config.json");
}

function absorb(jar, response) {
    let lines = [];
    if (typeof response.headers.raw === "function") {
        lines = response.headers.raw()["set-cookie"] || [];
    } else {
        const one = response.headers.get("set-cookie");
        if (one) lines = [one];
    }
    for (const line of lines) {
        const pair = String(line).split(";")[0];
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
}

function header(jar) {
    return Array.from(jar.entries()).map(([k, v]) => k + "=" + v).join("; ");
}

function hasSession(jar) {
    return jar.has("remix_userid") && jar.has("remix_userkey");
}

function sessionCookie(jar) {
    return ["remix_userid", "remix_userkey"]
        .filter((name) => jar.has(name))
        .map((name) => name + "=" + jar.get(name))
        .join("; ");
}

async function request(jar, url, options) {
    const headers = Object.assign({
        "User-Agent": common.fetchOptions.headers["User-Agent"],
        "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
        "Cookie": header(jar),
    }, options.headers || {});
    const res = await fetch(url, {
        method: options.method || "GET",
        redirect: "manual",
        headers,
        body: options.body,
    });
    absorb(jar, res);
    return res;
}

function saveSession(jar) {
    const file = configFile();
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    cfg.domain = common.domain;
    cfg.cookie = sessionCookie(jar);
    fs.writeFileSync(file, JSON.stringify(cfg, null, 4) + "\n");
    common.fetchOptions.headers.Cookie = cfg.cookie;
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
    const jar = new Map();
    const origin = String(common.domain).replace(/\/$/, "");
    try {
        await request(jar, origin + "/", { method: "GET" });
        const creds = new URLSearchParams({ email: email, password: password }).toString();
        let res = await request(jar, origin + "/eapi/user/login", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: creds,
        });
        if (!hasSession(jar)) {
            const classic = new URLSearchParams({
                email: email,
                password: password,
                action: "login",
                site_mode: "books",
                redirect: "1",
            }).toString();
            res = await request(jar, origin + "/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": origin + "/login",
                },
                body: classic,
            });
        }
        if (!hasSession(jar) && res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            if (loc) {
                const next = loc.startsWith("http") ? loc : origin + (loc.startsWith("/") ? loc : "/" + loc);
                await request(jar, next, { method: "GET" });
            }
        }
        if (!hasSession(jar)) {
            fail("Sign-in failed");
            return;
        }
        saveSession(jar);
        socket.write("OK\n");
        socket.end();
    } catch (err) {
        fail("Sign-in failed");
    }
};
