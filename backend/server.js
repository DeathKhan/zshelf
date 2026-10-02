const { execSync } = require("child_process");
const net = require("net");
const { getList, getSaved } = require("./list");
const getInfo = require("./info");
const getMeta = require("./metadata");
const download = require("./download");

const socketLocation = "/tmp/zshelf_socket";
execSync("rm -f " + socketLocation);

const server = net.createServer();
server.listen(socketLocation, () => {
    console.log('[SERVER] Ready');

    setInterval(() => {
        // Exit when zshelf dies
        try { execSync("pidof zshelf"); }
        catch { process.exit(0); }
    }, 10000);
});

server.on("connection", (client) => {
    console.log('[SERVER] New client');
    let input = "";
    let dispatched = false;
    client.on("error", () => {});
    client.on("data", (data) => {
        if (dispatched) return;
        input += data.toString();
        if (input.length > 65536) { client.end("ERR: Request too large\n"); return; }
        try {
            const raw = input.split("\n");
            const cmd = raw[0];
            const sizes = {LIST: 9, SAVE: 2, META: 1, DOWN: 2, INFO: 0, LOGIN: 2, IMG: 1};
            if (!(cmd in sizes)) { client.end("ERR: Unknown request\n"); return; }
            if (raw.length < sizes[cmd] + 2) return;
            dispatched = true;
            const arg = raw.slice(1, sizes[cmd] + 1);
            switch (cmd) {
                case "LIST": getList(arg, client); break;
                case "INFO": getInfo(arg, client); break;
                case "META": getMeta(arg, client); break;
                case "DOWN": download(arg, client); break;
                case "SAVE": getSaved(arg, client); break;
                case "LOGIN": require("./login")(arg[0] || "", arg[1] || "", client); break;
                case "IMG": require("./image")(arg, client); break;
            }
        } catch (err) {
            client.write("ERR: 0 " + err + "\n");
            client.end();
        }
    });
});

server.on("error", (err) => console.log("ERR: " + err));
server.on("close", () => process.exit(0));
