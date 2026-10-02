const cheerio = require("cheerio");
const common = require("./common");
const { fetchOptions, fetchWithRetry } = common;

function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The visible /dl/ href is often a decoy (HTTP 204 or an empty body). The real
// path is built by the addDownloadedBook click handler from a character array.
function scriptDownloadPath(html) {
    const $ = cheerio.load(html);
    let found = "";
    $("script").each((_, el) => {
        if (found) return;
        const text = $(el).html() || "";
        if (text.indexOf("addDownloadedBook") === -1 || text.indexOf(".join") === -1) return;
        const joined = new Set();
        const joinRe = /([A-Za-z_$][\w$]*)\s*\.\s*join/g;
        let m;
        while ((m = joinRe.exec(text))) joined.add(m[1]);
        const assignRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[([^\]]*)\]/g;
        while ((m = assignRe.exec(text))) {
            if (!joined.has(m[1])) continue;
            const litRe = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
            let lit;
            let built = "";
            while ((lit = litRe.exec(m[2]))) {
                const raw = lit[1] != null ? lit[1] : (lit[2] || "");
                built += raw.replace(/\\\//g, "/").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
            }
            if (built.startsWith("/dl/") || built.startsWith("/file/")) found = built;
        }
    });
    return found;
}

function buttonDownloadPath($) {
    const links = $('a.addDownloadedBook[href]').toArray();
    const usable = links.map(el => ({
        href: $(el).attr('href') || '',
        text: $(el).text() || ''
    })).filter(item => item.href.startsWith('/dl/') || item.href.startsWith('/file/'));
    const epub = usable.find(item => /epub/i.test(item.text));
    return (epub || usable[0] || {}).href || '';
}

function parseMetadata(html) {
    const $ = cheerio.load(html);
    const cleanText = node => {
        const copy = node.clone();
        copy.find('script, style, noscript, template, select, button, svg').remove();
        return copy.text().replace(/\s+/g, ' ').trim();
    };
    const name = cleanText($('h1').first());
    if (!name) throw new Error('Book details are unavailable. Please try again.');
    const author = cleanText($('[itemprop="author"]')) || cleanText($('i.authors').first());
    // The category widget includes the entire site taxonomy. Only display book
    // facts, not its hidden selector tree (hundreds of KB on the live site).
    const labels = /^(year|edition|publisher|language|pages|file|isbn(?:[- ]?\d+)?|series|volume):?$/i;
    const facts = $('.bookDetailsBox .bookProperty').toArray().map(element => {
        const label = cleanText($(element).children('.property_label').first());
        if (!labels.test(label)) return '';
        const value = cleanText($(element).children('.property_value').first()).slice(0, 1000);
        return value ? `<b>${escapeHtml(label)}</b> ${escapeHtml(value)}` : '';
    }).filter(Boolean);
    const description = cleanText($('#bookDescriptionBox')).slice(0, 20000);
    const img = $('.details-book-cover-container img').first().attr('src') || $('z-cover img').first().attr('src') || '';
    const absolute = value => { try { return value ? new URL(value, common.domain).href : ''; } catch (_) { return ''; } };
    const similars = $('#bMosaicBox .brick').toArray().map(element => ({
        url: $(element).find('a').attr('href') || '',
        img: absolute($(element).find('img').attr('src')),
        name: $(element).find('img').attr('alt') || $(element).find('a').attr('title') || 'Related book',
    })).filter(book => book.url);
    // Empty <a href="/dl/..."> anchors are decoys (HTTP 204). The file link is the
    // addDownloadedBook control. An obfuscated script path is only a fallback.
    let dlUrl = buttonDownloadPath($) || scriptDownloadPath(html) || '';
    if (dlUrl === '#') dlUrl = '';
    return { name, author, img: absolute(img), dlUrl, similars,
        description: facts.join(' | ') + (description ? '<hr><p>' + escapeHtml(description) + '</p>' : '') };
}

module.exports = async function (args, socket) {
    try {
        if (!args[0]) throw new Error('No book selected');
        const pathname = new URL(args[0], common.domain).pathname;
        const cache = require('./detail-cache');
        let html = cache.get(pathname);
        if (!html) {
            const response = await fetchWithRetry(common.domain + pathname, {...fetchOptions, timeout: 12000});
            if (!response.ok || response.status === 204) throw new Error('Book details are unavailable. Please try again.');
            html = await response.text();
            cache.remember(pathname, html);
        }
        const detail = parseMetadata(html);
        // Related covers must not bypass the shelf filter or delay opening details.
        detail.similars = detail.similars.filter(require('./list').approvedCached);
        socket.write(JSON.stringify(detail) + '\n');
    } catch (error) {
        socket.write('ERR: ' + error.message + '\n');
    }
    socket.end();
};
module.exports.parseMetadata = parseMetadata;
module.exports.scriptDownloadPath = scriptDownloadPath;
module.exports.buttonDownloadPath = buttonDownloadPath;
