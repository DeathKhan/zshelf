const fs = require("fs");
const { join: pathJoin, extname, basename } = require("path");
const { v4 } = require("uuid");

function copyClone(src, dest) {
    try {
        fs.copyFileSync(src, dest, fs.constants.COPYFILE_FICLONE);
    } catch (e) {
        if (e.code === "ENOTSUP" || e.code === "EXDEV" || e.code === "ENOSYS" || e.code === "EPERM") {
            fs.copyFileSync(src, dest);
            return;
        }
        throw e;
    }
}

const common = require("./common");
const { fetchOptions, fetchWithRetry } = common;

const KOREADER_DIR = "/home/root/Books";
function stagingDir() {
    // Tablet default stays under /home. Tests set ZSHELF_DL_TMP to a real temp dir.
    return process.env.ZSHELF_DL_TMP || "/home/root/.zshelf-dl";
}

function publicErr(err) {
    return String((err && err.message) || err || "download failed")
        .replace(/https?:\/\/\S+/gi, "<url>");
}

function stripMirror(name) {
    return String(name || "")
        .replace(/\s*\([^)]*(?:z-library|1lib|z-lib|zlib)\.[a-z0-9]+[^)]*\)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function safeStem(name) {
    return stripMirror(name)
        .replace(/[\u0000-\u001f]/g, "")
        .replace(/[\\/]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
}

// filename="...", filename=bare, or filename*=UTF-8''percent-encoded.
function nameFromDisposition(disposition) {
    const header = String(disposition || "");
    if (!header) return "";
    const star = header.match(/filename\*\s*=\s*([^';]*)''([^;]+)/i);
    if (star) {
        const raw = star[2].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
        try {
            return decodeURIComponent(raw);
        } catch (e) {
            return raw;
        }
    }
    const quoted = header.match(/filename\s*=\s*"([^"]*)"/i) || header.match(/filename\s*=\s*'([^']*)'/i);
    if (quoted) return Buffer.from(quoted[1], "binary").toString("utf8");
    const bare = header.match(/filename\s*=\s*([^;]+)/i);
    if (bare) return Buffer.from(bare[1].trim(), "binary").toString("utf8");
    return "";
}

function extFromType(contentType) {
    const type = String(contentType || "").toLowerCase();
    if (type.includes("epub")) return ".epub";
    if (type.includes("pdf")) return ".pdf";
    if (type.includes("mobi") || type.includes("mobipocket")) return ".mobi";
    return "";
}

function knownExt(value) {
    const raw = String(value || "").split("?")[0].toLowerCase();
    if (raw === ".epub" || raw === ".pdf" || raw === ".mobi") return raw;
    const ext = extname(raw);
    if (ext === ".epub" || ext === ".pdf" || ext === ".mobi") return ext;
    return "";
}

function sniffExt(filePath) {
    let fd;
    try {
        fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(80);
        const n = fs.readSync(fd, buf, 0, 80, 0);
        const head = buf.slice(0, n).toString("latin1");
        if (head.startsWith("%PDF")) return ".pdf";
        if (head.includes("BOOKMOBI")) return ".mobi";
        if (head.startsWith("PK")) return ".epub";
    } catch (e) {
        return "";
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
    return "";
}

function resolveName(disposition, contentType, title, urlPath) {
    const fromHeader = safeStem(nameFromDisposition(disposition));
    let ext = knownExt(fromHeader) || extFromType(contentType) || knownExt(urlPath);
    let stem = fromHeader ? basename(fromHeader, extname(fromHeader)) : "";
    if (!stem) {
        const fallback = safeStem(title) || safeStem(decodeURIComponent(basename(String(urlPath || "").split("?")[0]))) || "book";
        const fallbackExt = knownExt(fallback);
        if (!ext && fallbackExt) ext = fallbackExt;
        stem = basename(fallback, extname(fallback)) || "book";
    }
    stem = safeStem(stem) || "book";
    return { fileName: stem, fileExt: ext };
}

function copyTo(dir, fileName, fileExt, tempFilePath, socket, tag) {
    if (!dir) return;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    copyClone(tempFilePath, pathJoin(dir, fileName + fileExt));
    socket.write(tag + "\n");
}

module.exports = function (args, socket) {
    if (args.length < 1 || !args[0]) {
        socket.write("ERR: No download link\n");
        socket.end();
        return;
    }

    let path = String(args[0]);
    if (path.startsWith("http://") || path.startsWith("https://")) {
        try {
            path = new URL(path).pathname;
        } catch (_) {}
    }
    if (path[0] !== "/") path = "/" + path;
    const title = args[1] || "";
    const downloadURL = common.domain + path;

    fetchWithRetry(downloadURL, fetchOptions).then((response) => {
        const disposition = response.headers.get("content-disposition");
        const contentType = response.headers.get("content-type");
        const dispositionKind = !disposition ? "none"
            : /filename\*/i.test(disposition) ? "star"
            : /filename\s*=\s*"/i.test(disposition) ? "quoted"
            : /filename\s*=/i.test(disposition) ? "unquoted"
            : "other";
        console.log("disposition", dispositionKind, "type", String(contentType || "").split(";")[0]);
        if (!response.ok || response.status === 204) {
            socket.write("ERR: 2 status " + response.status + "\n");
            if (response.body && response.body.resume) response.body.resume();
            socket.end();
            return;
        }
        let { fileName, fileExt } = resolveName(disposition, contentType, title, path);
        console.log("download name", fileName, fileExt || "(type later)");

        const fileLength = parseInt(response.headers.get("content-length"), 10) || 0;
        const encoding = String(response.headers.get("content-encoding") || "").toLowerCase();
        // node-fetch compress:true decodes the body before we count it.
        // Content-Length is the wire size, so it does not describe decoded bytes.
        const wireLength = !/gzip|deflate|br/.test(encoding);
        const uuid = v4();
        const stage = stagingDir();
        fs.mkdirSync(stage, { recursive: true });
        const tempFilePath = pathJoin(stage, uuid);
        console.log("download bytes", fileLength, wireLength ? "wire" : "decoded");

        const { pipeline, Transform } = require("stream");
        let received = 0;
        let lastProgress = -1;
        let lastUpdate = 0;
        const bodyComplete = () => wireLength && fileLength > 0 && received === fileLength;
        const abort = () => {
            // The local socket closing after the last byte must not cancel a
            // body that has already fully arrived.
            if (bodyComplete() || !response.body) return;
            response.body.destroy(new Error("Download cancelled"));
        };
        if (socket.once) socket.once("close", abort);
        socket.write("STATE:Downloading\n");
        const progress = new Transform({
            transform(chunk, encoding, callback) {
                received += chunk.length;
                const percent = fileLength > 0 ? Math.min(99, Math.floor(received / fileLength * 100)) : -1;
                if (percent !== lastProgress || Date.now() - lastUpdate > 1000) {
                    lastProgress = percent;
                    lastUpdate = Date.now();
                    socket.write(percent >= 0 ? "PROG:" + percent + "\n" : "STATE:Downloading\n");
                }
                callback(null, chunk);
            }
        });
        pipeline(response.body, progress, fs.createWriteStream(tempFilePath), async (error) => {
            let destinationTemp;
            let beat;
            try {
                // A short close after the last byte is not a failed download.
                if (error && !bodyComplete()) throw error;
                if (!received) throw new Error("Empty file");
                if (wireLength && fileLength && received !== fileLength) throw new Error("Incomplete file; please retry");
                if (/text\/html|application\/json/i.test(contentType || "")) throw new Error("Server returned a page instead of a book");
                if (!knownExt(fileExt)) fileExt = sniffExt(tempFilePath);
                if (!fileExt) throw new Error("Unrecognized book format");
                const writeLine = (line) => {
                    try { socket.write(line); } catch (err) {}
                };
                writeLine("STATE:Saving…\n");
                // Copying onto a nearly full disk can sit silent. A heartbeat
                // keeps the client from treating that pause as a dropped download.
                beat = setInterval(() => writeLine("STATE:Saving…\n"), 5000);
                if (beat.unref) beat.unref();
                const directory = common.additionalBookLocation || KOREADER_DIR;
                await fs.promises.mkdir(directory, {recursive: true});
                const destination = pathJoin(directory, fileName + fileExt);
                destinationTemp = destination + "." + uuid + ".part";
                await fs.promises.copyFile(tempFilePath, destinationTemp);
                await fs.promises.rename(destinationTemp, destination);
                destinationTemp = "";
                writeLine("DONE:" + JSON.stringify(destination) + "\n");
                writeLine("PROG:100\n");
            } catch (err) {
                try { socket.write("ERR: " + publicErr(err) + "\n"); } catch (writeErr) {}
            } finally {
                if (beat) clearInterval(beat);
                if (socket.removeListener) socket.removeListener("close", abort);
                await fs.promises.unlink(tempFilePath).catch(() => {});
                if (destinationTemp) await fs.promises.unlink(destinationTemp).catch(() => {});
                try { socket.end(); } catch (err) {}
            }
        });
    }).catch((err) => {
        socket.write("ERR: 1 " + publicErr(err) + "\n");
        socket.end();
    });
};

module.exports.nameFromDisposition = nameFromDisposition;
module.exports.resolveName = resolveName;
