#!/usr/bin/env node
/**
 * Uses the same list + metadata parsing logic as the app to fetch a search page
 * and one book detail page, then fetches the image URLs and reports dimensions.
 * Run from backend/: node scripts/check-image-sizes.js
 * Validates that list thumbnails vs detail cover sizes differ and normalization is needed.
 */

const path = require("path");
const config = JSON.parse(require("fs").readFileSync(path.join(__dirname, "../../config.json")));
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const domain = config.domain.replace(/\/$/, "");
const fetchOptions = {
    headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": config.cookie || "",
    },
    method: "GET",
    redirect: "follow",
};

function getImageDimensions(buffer) {
    if (!buffer || buffer.length < 24) return null;
    const u8 = new Uint8Array(buffer);
    const readU16 = (i) => (u8[i] << 8) | u8[i + 1];
    const readU32 = (i) => (u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3];
    if (u8[0] === 0xff && u8[1] === 0xd8) {
        let i = 2;
        while (i < u8.length - 1) {
            if (u8[i] !== 0xff) { i++; continue; }
            const marker = u8[i + 1];
            if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
                const height = readU16(i + 5);
                const width = readU16(i + 7);
                return { width, height };
            }
            if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
            const len = readU16(i + 2);
            i += 2 + len;
        }
        return null;
    }
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x0d && u8[4] === 0x0a && u8[5] === 0x1a && u8[6] === 0x0a) {
        const width = readU32(16);
        const height = readU32(20);
        return { width, height };
    }
    return null;
}

async function main() {
    console.log("Fetching search results (same URL as list.js)...");
    const listURL = domain + "/s/?" + [
        "yearFrom=2020",
        "yearTo=" + new Date().getFullYear(),
        "languages[]=english",
        "extensions[]=PDF",
        "selected_content_types[]=book",
        "page=1",
    ].join("&");

    const listRes = await fetch(listURL, fetchOptions);
    const listHtml = await listRes.text();
    const $list = cheerio.load(listHtml);

    const books = $list(".resItemBoxBooks").get().map((ele) => {
        const $ele = $list(ele);
        const image = $ele.find("img");
        let imageUrl = image.attr("src") || "";
        if (!imageUrl && image.attr("data-srcset")) {
            const srcset = image.attr("data-srcset").split(", ");
            imageUrl = srcset.length ? srcset[srcset.length - 1].trim().split(/\s+/)[0] : "";
        }
        if (!imageUrl && image.attr("data-src")) imageUrl = image.attr("data-src");
        if (!imageUrl || imageUrl[0] === "/") imageUrl = "";
        const url = $ele.find("z-bookcard").attr("href")
            || $ele.find("h3 a").attr("href")
            || $ele.find('a[href*="/book/"]').first().attr("href");
        const name = $ele.find("[slot=title]").text().trim() || $ele.find("h3").text().trim();
        return { url: url || "", img: imageUrl || "", name };
    }).filter((b) => b.img);

    console.log("List page: %d books with image URLs\n", books.length);
    if (books.length === 0) {
        console.log("No list images found. Check selectors / site structure.");
        return;
    }

    const listSamples = books.slice(0, 3);
    let firstListDims = null;
    for (const book of listSamples) {
        let dims = null;
        let bytes = 0;
        if (book.img) {
            try {
                const imgRes = await fetch(book.img.startsWith("http") ? book.img : domain + book.img, fetchOptions);
                const buf = await imgRes.buffer();
                bytes = buf.length;
                dims = getImageDimensions(buf);
                if (!firstListDims && dims) firstListDims = dims;
            } catch (e) {
                console.log("  [LIST] %s: fetch err %s", (book.name || "").slice(0, 40), e.message);
                continue;
            }
        }
        console.log("  [LIST] %s", (book.name || "").slice(0, 50));
        console.log("    URL: %s", book.img ? book.img.slice(0, 80) + (book.img.length > 80 ? "..." : "") : "(none)");
        console.log("    Size: %d bytes  Dimensions: %s", bytes, dims ? `${dims.width}x${dims.height}` : "unknown");
    }

    const firstBook = books[0];
    if (!firstBook.url) {
        console.log("\nNo book URL for detail fetch.");
        return;
    }
    let detailPath = firstBook.url;
    if (detailPath.startsWith("http")) {
        try {
            detailPath = new URL(detailPath).pathname;
        } catch (_) {}
    }
    if (detailPath[0] !== "/") detailPath = "/" + detailPath;

    console.log("\nFetching book detail (same logic as metadata.js): %s", detailPath);
    const metaRes = await fetch(domain + detailPath, fetchOptions);
    const metaHtml = await metaRes.text();
    const $meta = cheerio.load(metaHtml);
    const imgEl = $meta(".details-book-cover-container img").first();
    const detailImgSrc = imgEl.attr("src") || $meta(".details-book-cover").attr("href") || "";

    if (!detailImgSrc) {
        console.log("  No detail image found.");
        return;
    }
    const detailImgUrl = detailImgSrc.startsWith("http") ? detailImgSrc : domain + detailImgSrc;
    let detailDims = null;
    let detailBytes = 0;
    try {
        const imgRes = await fetch(detailImgUrl, fetchOptions);
        const buf = await imgRes.buffer();
        detailBytes = buf.length;
        detailDims = getImageDimensions(buf);
    } catch (e) {
        console.log("  Detail image fetch err: %s", e.message);
        return;
    }
    console.log("  [DETAIL] %s", firstBook.name ? firstBook.name.slice(0, 50) : "");
    console.log("    URL: %s", detailImgUrl.slice(0, 80) + (detailImgUrl.length > 80 ? "..." : ""));
    console.log("    Size: %d bytes  Dimensions: %s", detailBytes, detailDims ? `${detailDims.width}x${detailDims.height}` : "unknown");

    console.log("\n--- Summary ---");
    console.log("List thumbnail (first):  %s", firstListDims ? `${firstListDims.width}x${firstListDims.height}` : "?");
    console.log("Detail cover (same book): %s", detailDims ? `${detailDims.width}x${detailDims.height}` : "?");
    if (firstListDims && detailDims) {
        const listPx = firstListDims.width * firstListDims.height;
        const detailPx = detailDims.width * detailDims.height;
        const ratio = (detailPx / listPx).toFixed(2);
        console.log("Pixel ratio (detail/list): " + ratio + "x — normalizing to a single display size is sound.");
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
