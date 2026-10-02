const test = require("node:test");
const assert = require("node:assert/strict");
const { isHiddenCategory, isBlockedTitle, categoriesFromHtml } = require("../list");

test("hides erotica, its subcategories, and any romance category", () => {
    assert.equal(isHiddenCategory("Erotica"), true);
    assert.equal(isHiddenCategory("Erotica - BDSM"), true);
    assert.equal(isHiddenCategory("Romance - Dark Romance"), true);
    assert.equal(isHiddenCategory("Romance - Erotic Romance"), true);
    assert.equal(isHiddenCategory("Romance - Contemporary Romance"), true);
    assert.equal(isHiddenCategory("Romance - Other Romance Categories"), true);
    assert.equal(isHiddenCategory("Crime, Thrillers & Mystery - Thrillers"), false);
    assert.equal(isHiddenCategory("History"), false);
    assert.equal(isHiddenCategory(""), false);
});

test("reads the book category link and ignores a hidden taxonomy select", () => {
    const html = `<div class="bookProperty property_categories">
      <div class="property_label">Categories:</div>
      <div class="property_value">
        <a href="/category/1">Romance - Contemporary Romance</a>
        <select><option>History</option><option>Science</option></select>
      </div>
    </div>`;
    assert.deepEqual(categoriesFromHtml(html), ["Romance - Contemporary Romance"]);
    const thriller = `<div class="bookProperty"><div class="property_label">Categories:</div>
      <div class="property_value"><a>Crime, Thrillers &amp; Mystery - Thrillers</a></div></div>`;
    const names = categoriesFromHtml(thriller);
    assert.deepEqual(names, ["Crime, Thrillers & Mystery - Thrillers"]);
    assert.equal(names.some(isHiddenCategory), false);
});

test("hides romantic and romantasy categories, not ordinary fiction", () => {
    assert.equal(isHiddenCategory("Romantic Comedy"), true);
    assert.equal(isHiddenCategory("Romantasy"), true);
    assert.equal(isHiddenCategory("Fiction - Romantic"), true);
    assert.equal(isHiddenCategory("Fantasy - Low Fantasy"), false);
    assert.equal(isHiddenCategory("Science Fiction"), false);
    assert.equal(isHiddenCategory("Fiction - American Fiction"), false);
});

test("blocks miscategorized titles before a detail fetch", () => {
    assert.equal(isBlockedTitle("Verity"), true);
    assert.equal(isBlockedTitle("the verity"), true);
    assert.equal(isBlockedTitle("A Court of Frost and Starlight"), true);
    assert.equal(isBlockedTitle("From Shy Guy to Ladies Man: The Memoirs of a Male Seducer"), true);
    assert.equal(isBlockedTitle("Twisted Hate"), true);
    assert.equal(isBlockedTitle("Credence"), true);
    assert.equal(isBlockedTitle("Powerless"), true);
    assert.equal(isBlockedTitle("Project Hail Mary"), false);
    assert.equal(isBlockedTitle("The Midnight Library"), false);
    assert.equal(isBlockedTitle("A Court of Silver Flames"), false);
    assert.equal(isBlockedTitle("Yellowface"), false);
});
