// Category checks already fetch detail pages. Reuse those bytes when a card
// opens, within a short lifetime and a fixed memory budget.
const entries = new Map();
const MAX_BYTES = 8 * 1024 * 1024;
let bytes = 0;
function remember(url, html) {
    const size = Buffer.byteLength(html);
    if (size > MAX_BYTES) return;
    if (entries.has(url)) { bytes -= entries.get(url).size; entries.delete(url); }
    entries.set(url, {html, size, at: Date.now()}); bytes += size;
    while (bytes > MAX_BYTES || entries.size > 24) {
        const key = entries.keys().next().value;
        bytes -= entries.get(key).size; entries.delete(key);
    }
}
function get(url) {
    const entry = entries.get(url);
    if (!entry) return null;
    if (Date.now() - entry.at > 5 * 60 * 1000) {
        bytes -= entry.size; entries.delete(url); return null;
    }
    entries.delete(url); entries.set(url, entry);
    return entry.html;
}
module.exports = {remember, get, clear() {entries.clear(); bytes = 0;}};
