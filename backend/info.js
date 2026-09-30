const cheerio = require("cheerio");
const { domain, fetchOptions, fetchWithRetry } = require("./common");

module.exports = function (args, socket) {
    const profile = fetchWithRetry(domain + "/papi/user/dstats", fetchOptions).then(res => res.json()).then(json => {
        if (!json) return {};
        const daily = json.dailyDownloads != null ? String(json.dailyDownloads) : "0";
        const limit = json.dailyDownloadsLimit != null ? String(json.dailyDownloadsLimit) : "?";
        return { today_download: daily + "/" + limit };
    })
        .catch(err => {
            socket.write("ERR: 1 " + err + "\n");
            socket.end();
        });

    const history = fetchWithRetry(domain + "/users/dstats.php?today", fetchOptions).then(res => res.text()).then(html => {
        const $ = cheerio.load(html);
        const rows = $(".dstats-row");
        if (!rows.length) return;

        return rows.get().map(row => {
            const a = $(row).find("a");
            if (!a) return undefined;

            let url = a.attr("href");
            let name = a.text().trim();
            if (!url || !name) return undefined;

            if (url[0] !== "/") url = "/" + url;

            return ({ url, name });
        })
            .filter(a => a);
    })
        .catch(err => {
            socket.write("ERR: 1 " + err + "\n");
            socket.end();
        });

    Promise.all([profile, history]).then(results => {
        if (!results || results.length < 2) return;
        const [profileData, todayList] = results;
        const final = Object.assign({ today_download: "0/?" }, profileData || {});
        final.today_list = todayList || [];
        socket.write(JSON.stringify(final));
        socket.write("\n");
        socket.end();
    })
        .catch(err => {
            socket.write("ERR: 1 " + err + "\n");
            socket.end();
        })

}
