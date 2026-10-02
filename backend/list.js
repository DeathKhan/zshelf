
const cheerio = require("cheerio");

function decodeHtml(str) {
    return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(d)).replace(/&quot;/g, '"');
}

const common = require("./common");
const { fetchOptions, fetchWithRetry } = common;

// z-lib.sk default home: /s/?yearFrom=2020&yearTo=CURRENT_YEAR&languages[]=english&extensions[]=AZW&extensions[]=PDF&selected_content_types[]=book
// Use languages[]= and extensions[]= (lowercase language value) so the site respects filters.
module.exports.getList = function (args, socket) {
    let [isExact, fromYear, toYear, lang, ext, order, query, page, adult] = args;

    const queryTrimmed = query ? String(query).trim() : "";
    const basePath = queryTrimmed ? "/s/" + encodeURIComponent(queryTrimmed) + "/?" : "/s/?";
    let listURL = [common.domain + basePath];

    if (isExact && isExact === "1") listURL.push("e=1");
    // Home shelf keeps the saved year and extension (recent English epubs).
    // A text search must not inherit those limits; language still applies.
    if (!queryTrimmed && fromYear && fromYear !== "Any") listURL.push("yearFrom=" + encodeURIComponent(fromYear));
    if (!queryTrimmed && toYear && toYear !== "Any") listURL.push("yearTo=" + encodeURIComponent(toYear));
    if (lang && lang !== "Any") listURL.push("languages[]=" + encodeURIComponent(String(lang).toLowerCase()));
    if (!queryTrimmed && ext && ext !== "Any") {
        const exts = String(ext).toUpperCase().split(/[,\s]+/).filter(Boolean);
        exts.forEach(e => listURL.push("extensions[]=" + encodeURIComponent(e)));
    } else if (!queryTrimmed) {
        listURL.push("extensions[]=AZW", "extensions[]=PDF");
    }

    if (order) {
        order = ({
            "Best Match": "bestmatch",
            "By Title (A-Z)": "titleA",
            "By Title (Z-A)": "title",
            "By Year": "year",
            "File Size Asc.": "filesizeA",
            "File Size Des.": "filesize",
            "Most Popular": "popular",
            "Recently added": "date",
        })[order];

        if (!order) order = "popular";
        listURL.push("order=" + order);
    }

    if (listURL.length < 2) {
        socket.write("ERR: Not enough query parameter\n");
        return;
    }

    if (page) listURL.push("page=" + page);
    listURL.push("selected_content_types[]=book");

    listURL = listURL.join("&");
    // adult === "1" turns the category filter off. Default is filtered.
    fetchList(listURL, socket, adult !== "1");
}

module.exports.getSaved = function(args, socket) {
    const adult = args && args[1];
    fetchList(common.domain + "/users/saved_books.php", socket, adult !== "1");
}

function fetchList(listURL, socket, filterSmut) {
    fetchWithRetry(listURL, {...fetchOptions, timeout: 12000}).then(res => {
        if (res.ok === false) throw new Error("Catalog request failed (" + res.status + "). Please retry.");
        const fileLength = parseInt(res.headers.get("content-length"), 10) || 0;

        let raw = "";

        res.body.on("data", (chunk) => {
            raw += chunk;
            if (fileLength > 0) {
                socket.write("PROG:" + Math.round(res.body.bytesWritten / fileLength * 100).toString() + "\n");
            }
        });

        res.body.on('end', () => {
            socket.write("PROG:100\n");
            sendResult(raw);
        });

        res.body.on("error", (err) => {
            socket.write("ERR: 2 " + err + "\n");
            socket.end();
        });
    })
        .catch(err => {
            socket.write("ERR: 1 " + err +  "\n");
            socket.end();
        });

    function sendResult(html) {
        // Fast regex path avoids 200ms cheerio block on the tablet CPU
        let totalItems = null;
        const totalMatch = html.match(/<[^>]*class="[^"]*totalCounter[^"]*"[^>]*>([^<]*)<\//);
        if (totalMatch) {
            totalItems = parseInt(totalMatch[1].replace(/[()+]/g, ""), 10);
        } else {
            const pagerMatch = html.match(/pagesTotal:\s*(\d+)/);
            if (pagerMatch) totalItems = parseInt(pagerMatch[1], 10) * 50;
        }
        if (totalItems && !isNaN(totalItems)) {
            socket.write("TOTAL:" + totalItems + "\n");
        }

        const books = [];
        const cardRegex = /<z-bookcard[\s\S]*?<\/z-bookcard>/g;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const cardHtml = match[0];
            const urlMatch = cardHtml.match(/href="([^"]+)"/);
            const imgMatch = cardHtml.match(/<img[^>]*data-src="([^"]+)"/);
            const imgMatchFallback = cardHtml.match(/<img[^>]*src="([^"]+)"/);
            const imgMatchSrcset = cardHtml.match(/<img[^>]*data-srcset="([^"]+)"/);

            let imageUrl = "";
            if (imgMatch) imageUrl = imgMatch[1];
            else if (imgMatchSrcset) {
                 const srcset = imgMatchSrcset[1].split(", ");
                 imageUrl = srcset.length ? srcset[srcset.length - 1].trim().split(/\s+/)[0] : "";
            } else if (imgMatchFallback) imageUrl = imgMatchFallback[1];

            if (imageUrl && imageUrl.startsWith("/")) imageUrl = "";

            const titleMatch = cardHtml.match(/<[^>]+slot="title">([^<]*)<\/[^>]+>/);
            const authorMatch = cardHtml.match(/<[^>]+slot="author">([^<]*)<\/[^>]+>/);

            const extMatch = cardHtml.match(/extension="([^"]+)"/);
            const sizeMatch = cardHtml.match(/filesize="([^"]+)"/);
            books.push({
                url: urlMatch ? decodeHtml(urlMatch[1]) : "",
                img: imageUrl,
                name: titleMatch ? decodeHtml(titleMatch[1].trim()) : "",
                author: authorMatch ? decodeHtml(authorMatch[1].trim()) : "",
                ext: extMatch ? decodeHtml(extMatch[1].trim()) : "",
                size: sizeMatch ? decodeHtml(sizeMatch[1].trim()) : ""
            });
        }

        if (books.length === 0) {
            const $ = cheerio.load(html);
            $(".resItemBoxBooks").each((_, ele) => {
                const $ele = $(ele);
                const image = $ele.find('img');
                let imageUrl = image.attr('src') || "";
                if (!imageUrl && image.attr('data-srcset')) {
                    const srcset = image.attr('data-srcset').split(", ");
                    imageUrl = srcset.length ? srcset[srcset.length - 1].trim().split(/\s+/)[0] : "";
                }
                if (!imageUrl && image.attr('data-src')) imageUrl = image.attr('data-src');
                if (!imageUrl || imageUrl[0] === "/") imageUrl = "";

                const url = $ele.find('z-bookcard').attr('href')
                    || $ele.find('h3 a').attr('href')
                    || $ele.find('a[href*="/book/"]').first().attr('href');
                const name = $ele.find('[slot="title"]').text().trim()
                    || $ele.find('h3').text().trim();
                const author = $ele.find('[slot="author"]').text().trim()
                    || $ele.find('div.authors').text().trim();

                books.push({ url: url || "", img: imageUrl || "", name, author });
            });
        }

        const currentPage = Number(new URL(listURL).searchParams.get("page")) || 1;
        const more = !listURL.includes("saved_books.php") && hasNextPage(html, currentPage, books.length);
        const finish = () => {
            socket.write("END:" + JSON.stringify({hasMore: more}) + "\n");
            socket.end();
        };
        if (!filterSmut) {
            // One JSON array per book so the shelf can paint the first card
            // before the rest of the page is on the socket.
            for (const book of books) emitBooks(socket, [book], false);
            if (!books.length) emitBooks(socket, [], false);
            finish();
            return;
        }

        let emitted = 0;
        filterBooks(books, (batch) => {
            for (const book of batch || []) {
                emitted += 1;
                emitBooks(socket, [book], false);
            }
        }, () => socket.destroyed).then(() => {
            if (!emitted) emitBooks(socket, [], false);
            saveCategoryCache();
            finish();
        }).catch(() => { socket.write("ERR: Could not finish checking books\n"); socket.end(); });
    }
}

// Known miscategorized titles. Matched loosely (case, punctuation, one leading
// article, and a subtitle after the title) before any detail-page fetch.
const BLOCKED_TITLES = [
    "Verity",
    "Credence",
    "Twisted Hate",
    "A Court of Frost and Starlight",
    "Powerless",
    "From Shy Guy to Ladies Man",
];

function normalizeTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^(the|a|an)\s+/, "");
}

function isBlockedTitle(value) {
    const name = normalizeTitle(value);
    if (!name) return false;
    return BLOCKED_TITLES.some((title) => {
        const blocked = normalizeTitle(title);
        return name === blocked || name.startsWith(blocked + " ");
    });
}

// Erotica (and its subcategories) plus any category containing romance,
// romantic, or romantasy. Ordinary fiction, thriller, and fantasy stay.
// adultCategories turns this off.
function isHiddenCategory(value) {
    const name = String(value || "").replace(/\s+/g, " ").trim();
    if (!name) return false;
    if (/erotica/i.test(name)) return true;
    if (/romantic|romance|romantasy/i.test(name)) return true;
    return false;
}

function extractLinks(htmlStr, names) {
    const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let hasLinks = false;
    let match;
    while ((match = linkRegex.exec(htmlStr)) !== null) {
        hasLinks = true;
        const text = decodeHtml(match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
        if (text) names.push(text);
    }
    if (!hasLinks) {
        let clean = htmlStr.replace(/<select[\s\S]*?<\/select>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (clean) names.push(decodeHtml(clean));
    }
}

function categoriesFromHtml(html) {
    const names = [];
    const blockRegex = /<div[^>]*class=['"][^'"]*property_categories[^'"]*['"][\s\S]*?<\/div>\s*<\/div>/gi;
    let blockMatch = blockRegex.exec(html);
    if (!blockMatch) {
         const looseRegex = /<div[^>]*class=['"][^'"]*property_label[^'"]*['"][^>]*>\s*Categories:?\s*<\/div>\s*<div[^>]*class=['"][^'"]*property_value[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i;
         const match = looseRegex.exec(html);
         if (match) {
              extractLinks(match[1], names);
         }
         return names;
    }

    const valRegex = /<div[^>]*class=['"][^'"]*property_value[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i;
    const valMatch = valRegex.exec(blockMatch[0]);
    if (valMatch) {
         extractLinks(valMatch[1], names);
    }
    return names;
}


const fs = require("fs");
const path = require("path");
const CACHE_FILE = process.env.ZSHELF_CATEGORY_CACHE || path.join(__dirname, "..", "category-cache-v2.json");
const categoryCache = new Map();
try {
    if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
        for (const key of Object.keys(data)) {
            categoryCache.set(key, data[key]);
        }
    }
} catch (e) {}

function saveCategoryCache() {
    try {
        const data = {};
        for (const [key, value] of Array.from(categoryCache.entries()).slice(-5000)) {
            if (value.checked > Date.now() - CACHE_AGE) data[key] = value;
        }
        const temporary = CACHE_FILE + "." + process.pid + ".tmp";
        fs.writeFileSync(temporary, JSON.stringify(data));
        fs.renameSync(temporary, CACHE_FILE);
    } catch (e) {}
}


// Unknown and failed checks are never approved. Old boolean caches are not
// reused: they treated a missing category as a successful check.
const categoryJobs = new Map();
const CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
function cachedDecision(url) {
    const entry = categoryCache.get(url);
    return entry && entry.checked > Date.now() - CACHE_AGE ? entry.hidden : undefined;
}
async function checkBook(book) {
    if (!book || !book.url || isBlockedTitle(book.name)) return false;
    const cached = cachedDecision(book.url);
    if (cached !== undefined) return !cached;
    if (categoryJobs.has(book.url)) return categoryJobs.get(book.url);
    const job = (async () => {
        try {
            const pathname = new URL(book.url, common.domain).pathname;
            const response = await fetchWithRetry(common.domain + pathname, {...fetchOptions, timeout: 12000});
            if (!response.ok || response.status === 204) return false;
            const html = await response.text();
            const categories = categoriesFromHtml(html);
            if (!categories.length) return false;
            const hidden = categories.some(isHiddenCategory);
            categoryCache.set(book.url, {hidden, checked: Date.now()});
            if (!hidden) require('./detail-cache').remember(pathname, html);
            return !hidden;
        } catch (_) { return false; }
    })();
    categoryJobs.set(book.url, job);
    try { return await job; } finally { categoryJobs.delete(book.url); }
}
async function filterBooks(books, onBatch = () => {}, cancelled = () => false) {
    const approved = [];
    const unknown = [];
    const seen = new Set();
    for (const book of books) {
        if (!book || !book.url || seen.has(book.url) || isBlockedTitle(book.name)) continue;
        seen.add(book.url);
        const cached = cachedDecision(book.url);
        if (cached === false) approved.push(book);
        else if (cached === undefined) unknown.push(book);
    }
    if (approved.length && !cancelled()) onBatch(approved.slice());
    // A slow check must not delay other approvals. Fixed workers append each
    // approved book once; already visible cards never change position.
    let cursor = 0;
    async function next() {
        while (!cancelled() && cursor < unknown.length) {
            const book = unknown[cursor++];
            const accepted = await checkBook(book);
            if (accepted && !cancelled()) { approved.push(book); onBatch([book]); }
        }
    }
    await Promise.all(Array.from({length: Math.min(4, unknown.length)}, next));
    return approved;
}
module.exports.filterBooks = filterBooks;

// Titles go out immediately. Cover downloads for this page are already running
// and share one cache with the IMG handler. Do not await them here.
function emitBooks(socket, books, shouldClose = true) {
    require("./image").prefetchCovers((books || []).slice(0, 12).map((book) => book && book.img));
    socket.write(JSON.stringify(books) + "\n");
    if (shouldClose) socket.end();
}

module.exports.isHiddenCategory = isHiddenCategory;
module.exports.emitBooks = emitBooks;
module.exports.isBlockedTitle = isBlockedTitle;
module.exports.categoriesFromHtml = categoriesFromHtml;

module.exports.approvedCached = book => book && !isBlockedTitle(book.name) && cachedDecision(book.url) === false;

function hasNextPage(html, page, count) {
    if (!count) return false;
    const pages = html.match(/pagesTotal:\s*(\d+)/);
    if (pages) return page < Number(pages[1]);
    const next = new RegExp('href=["\'][^"\']*[?&](?:amp;)?page=' + (page + 1) + '(?:[&#"\'])', 'i');
    if (next.test(html)) return true;
    // Some mirrors omit pagination markup; an empty next page ends scanning.
    return count >= 50;
}
module.exports.hasNextPage = hasNextPage;
