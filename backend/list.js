
const cheerio = require("cheerio");
const { domain, fetchOptions, fetchWithRetry } = require("./common");

// z-lib.sk default home: /s/?yearFrom=2020&yearTo=CURRENT_YEAR&languages[]=english&extensions[]=AZW&extensions[]=PDF&selected_content_types[]=book
// Use languages[]= and extensions[]= (lowercase language value) so the site respects filters.
module.exports.getList = function (args, socket) {
    let [isExact, fromYear, toYear, lang, ext, order, query, page] = args;

    const queryTrimmed = query ? String(query).trim() : "";
    const basePath = queryTrimmed ? "/s/" + encodeURIComponent(queryTrimmed) + "/?" : "/s/?";
    let listURL = [domain + basePath];

    if (isExact && isExact === "1") listURL.push("e=1");
    const currentYear = new Date().getFullYear();
    const yearFromVal = (fromYear && fromYear !== "Any") ? fromYear : String(currentYear - 10);
    const yearToVal = (toYear && toYear !== "Any") ? toYear : String(currentYear);
    listURL.push("yearFrom=" + encodeURIComponent(yearFromVal), "yearTo=" + encodeURIComponent(yearToVal));
    if (lang && lang !== "Any") listURL.push("languages[]=" + encodeURIComponent(String(lang).toLowerCase()));
    if (ext && ext !== "Any") {
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
    fetchList(listURL, socket);
}

module.exports.getSaved = function(_, socket) {
    fetchList(domain + "/users/saved_books.php", socket);
}

function fetchList(listURL, socket) {
    fetchWithRetry(listURL, fetchOptions).then(res => {
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
        const $ = cheerio.load(html);

        let totalItems = $(".totalCounter").first();
        if (totalItems.length) {
            const n = parseInt(totalItems.text().replace(/[()+]/g, ""), 10);
            if (!isNaN(n)) socket.write("TOTAL:" + n + "\n");
        }

        // List page uses card thumbnails (often small); book detail page uses larger cover. We take
        // best available here (src, or largest from data-srcset, or data-src). The UI normalizes
        // display size via sourceSize so list and detail images render at the same dimensions.
        const books = $(".resItemBoxBooks").get().map(ele => {
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

            return { url: url || "", img: imageUrl || "", name, author };
        });
        socket.write(JSON.stringify(books));
        socket.write("\n");
        socket.end();
    }
}