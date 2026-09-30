const { writeFileSync, copyFileSync, existsSync, mkdirSync, createWriteStream, constants } = require("fs");
const { join: pathJoin, extname, basename } = require("path");
const { v4 } = require("uuid");
const { domain, fetchOptions, fetchWithRetry, additionalBookLocation } = require("./common");

module.exports = function (args, socket) {
    if (args.length < 1) {
        socket.write("ERR: No download link\n");
        return;
    }

    const xochitlFolder = "/home/root/.local/share/remarkable/xochitl/";
    let path = args[0];
    if (path.startsWith("http://") || path.startsWith("https://")) {
        try {
            path = new URL(path).pathname;
        } catch (_) {}
    }
    if (path[0] !== "/") path = "/" + path;
    const downloadURL = domain + path;
    console.log(downloadURL);

    fetchWithRetry(downloadURL, fetchOptions).then((response) => {
        console.log("Redirected to:", response.url);

        let fileName;
        let fileExt;

        const disposition = response.headers.get('content-disposition');
        if (disposition) {
            const nameMatch = disposition.match(/filename="(.+)"/);
            if (nameMatch) {
                let name = nameMatch[1].replace(/\s*\(1lib\.sk\)\s*/gi, "").replace(/\s*\(z-lib\.fm\)\s*/gi, "").replace(/\s*\(z-lib\.sk\)\s*/gi, "").trim();
                // Convert multi-byte chars to their true representation
                name = Buffer.from(name, "binary").toString("utf8");

                fileExt = extname(name);
                fileName = basename(name, fileExt);
                console.log(fileName, fileExt);
            }
        }

        if (!fileName || !fileExt) {
            socket.write("ERR: 2 No file\n");
            return;
        }

        const fileLength = parseInt(response.headers.get("content-length"), 10) || 0;

        const uuid = v4();
        const tempFilePath = "/tmp/" + uuid;
        console.log(tempFilePath, fileLength);

        const fileStream = createWriteStream(tempFilePath);

        response.body.on("data", (chunk) => {
            fileStream.write(chunk, () => {
                if (fileLength > 0) {
                    socket.write("PROG:" + Math.floor(fileStream.bytesWritten / fileLength * 95).toString() + "\n");
                    if (fileStream.bytesWritten >= fileLength) {
                        fileStream.close();
                    }
                }
            });
        });

        response.body.on("end", () => {
            if (fileLength === 0 || fileStream.bytesWritten > 0) {
                fileStream.close();
            }
        });

        response.body.on("error", (error) => {
            socket.write("ERR: 2 " + error + "\n");
            socket.end();
        });

        fileStream.on('close', () => {
            socket.write("DOWNLOAD DONE\n");

            if (fileExt == ".epub" || fileExt == ".pdf") {
                writeFileSync(xochitlFolder + uuid + ".metadata", JSON.stringify({
                    "deleted": false,
                    "lastModified": "1",
                    "lastOpenedPage": 0,
                    "metadatamodified": false,
                    "modified": false,
                    "parent": "",
                    "pinned": false,
                    "synced": false,
                    "type": "DocumentType",
                    "version": 1,
                    "visibleName": fileName
                }));

                copyFileSync(tempFilePath, pathJoin(xochitlFolder, uuid + fileExt), constants.COPYFILE_FICLONE);
                socket.write("COPIED XOCHITL\n");
            }

            if (additionalBookLocation) {
                if (!existsSync(additionalBookLocation)) {
                    mkdirSync(additionalBookLocation, { recursive: true });
                }
                copyFileSync(tempFilePath, pathJoin(additionalBookLocation, fileName + fileExt), constants.COPYFILE_FICLONE);
                socket.write("COPIED LOCAL\n");
            }
            socket.write("PROG:100\n");
            socket.end();
        });
    })
        .catch(err => {
            socket.write("ERR: 1 " + err + "\n");
            socket.end();
        });
}
