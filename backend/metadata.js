const cheerio = require("cheerio");
const { domain, fetchOptions, fetchWithRetry } = require("./common");

module.exports = function (args, socket) {
    if (args.length < 1) {
        console.log("ERR: No link");
        return;
    }

    let path = args[0];
    if (path.startsWith("http://") || path.startsWith("https://")) {
        try {
            const u = new URL(path);
            path = u.pathname;
        } catch (_) {}
    }
    if (path[0] !== "/") path = "/" + path;

    fetchWithRetry(domain + path, fetchOptions).then(a => a.text()).then(html => {
        const $ = cheerio.load(html);

        const author = $(`[itemprop="author"]`)
            .toArray()
            .map(e => $(e).text().trim())
            .join(", ");

        let description = $("#bookDescriptionBox").html();

        let detail = $(".bookDetailsBox");
        if (detail) {
            detail = $(detail[0]).find(".bookProperty")
                .toArray()
                .map(e => `<b>${$(e).find(".property_label").text().trim()}</b> ${$(e).find(".property_value").text().trim()}`)
                .join(" | ");
        }

        if (description) {
            description = detail + "<hr>" + description.trim();
        } else {
            description = detail;
        }

        let dlUrl = $('a[href^="/dl/"]').first().attr("href") || $(".dlButton").attr("href");
        if (!dlUrl || dlUrl === "#") dlUrl = "";

        const similars = $("#bMosaicBox .brick").get().map(a => ({
            url: $(a).find("a").attr("href"),
            img: $(a).find("img").attr("src"),
        }));

        // Detail page cover is usually larger than list card thumbnails; UI normalizes via sourceSize.
        const imgEl = $(".details-book-cover-container img").first();
        const imgSrc = imgEl.attr("src") || $(".details-book-cover").attr("href") || "";
        socket.write(JSON.stringify({
            name: $("h1").text().trim(),
            author,
            img: imgSrc,
            description,
            dlUrl,
            similars,
        }));
        socket.write("\n");
        socket.end();
    })
        .catch(err => {
            socket.write("ERR: 1 " + err + "\n");
            socket.end();
        });
}
