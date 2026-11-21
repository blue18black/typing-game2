// ハロー！プロジェクト公式サイトからメンバー情報を取得して
// data.js と images/auto/ を更新するスクリプト。
//
// 使い方: node scripts/update-members.mjs
// GitHub Actions (.github/workflows/update-members.yml) から毎日実行される。
// グループ構成・メンバー構成・名前・ローマ字(公式サイトのよみがなから生成)・アー写・グループ名・グループ写真を自動で取得する。

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://helloproject.com";
const DATA_FILE = join(ROOT, "data.js");
const IMAGE_DIR = join(ROOT, "images", "auto");
const USER_AGENT = "typing-game2-updater (+https://github.com/blue18black/typing-game2)";
const REQUEST_INTERVAL_MS = 500;

// グループは公式サイトのナビゲーション (Artist) から自動で検出する。
// 新グループが追加されれば自動でゲームに加わり、解散すれば消える。

// ゲームの対象外にするグループ (公式サイトの URL の slug で判定)。
// 研修生 (helloprokenshusei, helloprokenshuseihokkaido など) と OG (卒業メンバー) を除外。
const EXCLUDE = [/kenshusei/, /^og$/];
const isExcluded = (slug) => EXCLUDE.some((re) => re.test(slug));

// 既存グループのサイト内キーとラベルの色。
// ここにない新グループは slug がそのままキーになり、色は公式サイトのグループカラーを使う。
const KNOWN_GROUPS = {
    morningmusume: { id: "morning", color: "#E5457D" },
    angerme: { id: "ange", color: "#FF85AD" },
    juicejuice: { id: "juice", color: "#FF9900" },
    tsubakifactory: { id: "tsubaki", color: "#787FDC" },
    beyooooonds: { id: "beyo", color: "#BA3CB8" },
    ochanorma: { id: "ocha", color: "#41B06C" },
    rosychronicle: { id: "rosy", color: "#BF3B3B" },
};

// 自動生成されたローマ字を変えたいときに使う。キーは "グループのslug/メンバーのslug" (公式サイトの URL)。
// 例: "morningmusume/miki_nonaka": "nonakamiki",
const ROMAJI_OVERRIDES = {
};

// ---------- 通信 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, asBuffer = false) {
    for (let attempt = 1; ; attempt++) {
        try {
            await sleep(REQUEST_INTERVAL_MS);
            const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
        } catch (e) {
            if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
            await sleep(2000 * attempt);
        }
    }
}

function decodeEntities(s) {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

const clean = (s) => decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

// ---------- ローマ字変換 ----------
// script.js の SYMMETRIC_ROMAJI_GROUPS にある表記 (si/shi, ti/chi, tu/tsu, hu/fu, ji/zi など) は
// どちらで打っても正解になるので、ここでは表示用の表記を1つ決めるだけでよい。

const KANA_2 = {
    キャ: "kya", キュ: "kyu", キョ: "kyo",
    シャ: "sya", シュ: "syu", シェ: "sye", ショ: "syo",
    チャ: "tya", チュ: "tyu", チェ: "tye", チョ: "tyo",
    ニャ: "nya", ニュ: "nyu", ニョ: "nyo",
    ヒャ: "hya", ヒュ: "hyu", ヒョ: "hyo",
    ミャ: "mya", ミュ: "myu", ミョ: "myo",
    リャ: "rya", リュ: "ryu", リョ: "ryo",
    ギャ: "gya", ギュ: "gyu", ギョ: "gyo",
    ジャ: "ja", ジュ: "ju", ジェ: "je", ジョ: "jo",
    ヂャ: "dya", ヂュ: "dyu", ヂョ: "dyo",
    ビャ: "bya", ビュ: "byu", ビョ: "byo",
    ピャ: "pya", ピュ: "pyu", ピョ: "pyo",
    ファ: "fa", フィ: "fi", フェ: "fe", フォ: "fo",
    ヴァ: "va", ヴィ: "vi", ヴェ: "ve", ヴォ: "vo",
    ティ: "thi", ディ: "dhi", デュ: "dhu", トゥ: "twu", ドゥ: "dwu",
    ウィ: "wi", ウェ: "we", ウォ: "who", ツァ: "tsa", イェ: "ye",
};

const KANA_1 = {
    ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o",
    カ: "ka", キ: "ki", ク: "ku", ケ: "ke", コ: "ko",
    サ: "sa", シ: "si", ス: "su", セ: "se", ソ: "so",
    タ: "ta", チ: "ti", ツ: "tu", テ: "te", ト: "to",
    ナ: "na", ニ: "ni", ヌ: "nu", ネ: "ne", ノ: "no",
    ハ: "ha", ヒ: "hi", フ: "hu", ヘ: "he", ホ: "ho",
    マ: "ma", ミ: "mi", ム: "mu", メ: "me", モ: "mo",
    ヤ: "ya", ユ: "yu", ヨ: "yo",
    ラ: "ra", リ: "ri", ル: "ru", レ: "re", ロ: "ro",
    ワ: "wa", ヰ: "wi", ヱ: "we", ヲ: "wo",
    ガ: "ga", ギ: "gi", グ: "gu", ゲ: "ge", ゴ: "go",
    ザ: "za", ジ: "ji", ズ: "zu", ゼ: "ze", ゾ: "zo",
    ダ: "da", ヂ: "di", ヅ: "du", デ: "de", ド: "do",
    バ: "ba", ビ: "bi", ブ: "bu", ベ: "be", ボ: "bo",
    パ: "pa", ピ: "pi", プ: "pu", ペ: "pe", ポ: "po",
    ヴ: "vu",
    ァ: "xa", ィ: "xi", ゥ: "xu", ェ: "xe", ォ: "xo",
    ャ: "xya", ュ: "xyu", ョ: "xyo", ヮ: "xwa",
};

// カタカナ(ひらがなも可)をタイピング用ローマ字に変換する。変換できない文字があれば null
function kanaToRomaji(kana) {
    const s = kana
        .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
        .replace(/[\s　・･=＝]/g, "");
    const syllables = [];
    for (let i = 0; i < s.length; ) {
        const two = KANA_2[s.slice(i, i + 2)];
        if (two) { syllables.push(two); i += 2; continue; }
        const c = s[i];
        if (KANA_1[c]) syllables.push(KANA_1[c]);
        else if (c === "ン" || c === "ッ" || c === "ー") syllables.push(c);
        else return null;
        i += 1;
    }

    let out = "";
    for (let i = 0; i < syllables.length; i++) {
        const syl = syllables[i];
        const next = syllables[i + 1];
        if (syl === "ン") {
            // 母音・や行・な行の前と末尾は nn、それ以外は n (ゲーム側は n / nn どちらでも受け付ける)
            out += !next || /^[aiueoyn]/.test(next) ? "nn" : "n";
        } else if (syl === "ッ") {
            out += next && /^[a-z]/.test(next) && !/^[aiueon]/.test(next) ? next[0] : "xtu";
        } else if (syl === "ー") {
            out += out.match(/[aiueo](?=[^aiueo]*$)/)?.[0] ?? "";
        } else {
            out += syl;
        }
    }
    return /^[a-z]+$/.test(out) ? out : null;
}

// よみがなが取れなかったときの予備: URL の slug (例: miki_nonaka) から 苗字+名前 のローマ字を作る
function slugToRomaji(slug) {
    const parts = slug.split(/[_-]/).filter(Boolean);
    return parts.length >= 2 ? [...parts.slice(1), parts[0]].join("") : parts.join("");
}

// ---------- 公式サイトの解析 ----------

// トップページから、グループ一覧・グループ写真・グループカラーを取得する
async function discoverGroups() {
    const html = await fetchWithRetry(`${BASE}/`);
    const slugs = [];
    for (const m of html.matchAll(/<a href="\/([a-z0-9_-]+)\/"[^>]*class="[^"]*NavigationLink--group[^"]*"/g)) {
        if (!slugs.includes(m[1])) slugs.push(m[1]);
    }
    if (slugs.length === 0) {
        throw new Error("トップページからグループ一覧を取得できませんでした (サイトの構造が変わった可能性)");
    }
    const excluded = slugs.filter(isExcluded);
    if (excluded.length) console.log(`対象外: ${excluded.join(", ")}`);

    // トップページの「Artist」欄のグループ写真 (1500x1000)。なければグループページの og:image を使う
    const images = {};
    const artists = html.slice(html.indexOf("commonGrid--artists"));
    for (const m of artists.matchAll(/<a [^>]*href="\/([a-z0-9_-]+)\/"[^>]*>\s*<div class="Thumbnail[^"]*"><img src="([^"]+)"/g)) {
        images[m[1]] ??= m[2];
    }

    // 新グループのラベル色用に、サイトの CSS に定義されているグループカラー (--color-<slug>-primary) を読む
    let css = "";
    if (slugs.some((s) => !isExcluded(s) && !KNOWN_GROUPS[s])) {
        for (const m of html.matchAll(/<link rel="stylesheet" href="(\/[^"]+\.css)"/g)) {
            css += await fetchWithRetry(new URL(m[1], BASE).href);
        }
    }
    const cssColor = (slug) =>
        css.match(new RegExp(`--color-${slug}-primary:\\s*(#[0-9a-fA-F]{3,6})`))?.[1].toUpperCase() ?? null;

    return slugs.filter((s) => !isExcluded(s)).map((slug) => ({
        id: KNOWN_GROUPS[slug]?.id ?? slug,
        slug,
        image: images[slug] ?? null,
        color: KNOWN_GROUPS[slug]?.color ?? cssColor(slug),
    }));
}

// グループページ: グループ名・グループ写真(予備)・メンバー一覧(順番・正方形アー写)
function parseGroupPage(html, slug) {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
    const name = title ? decodeEntities(title).split(" - ")[0].trim() : null;
    const groupImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1]
        ?? html.match(/og:image"\s+content="([^"]+)"/)?.[1];

    const members = [];
    const re = new RegExp(
        `<div class="MemberPanel"><a href="/${slug}/([a-z0-9_-]+)/"[\\s\\S]*?<img src="([^"]+)"`,
        "g",
    );
    for (const m of html.matchAll(re)) {
        if (!members.some((x) => x.id === m[1])) {
            members.push({ id: m[1], thumb: m[2] });
        }
    }
    return { name, groupImage, members };
}

// メンバーページ: 名前・よみがな (「Miki Nonaka ／ ノナカ ミキ」の後半)
function parseMemberPage(html) {
    const m = html.match(/<h1 class="postTitle[^"]*"[^>]*>([\s\S]*?)<\/h1>\s*<div[^>]*>([\s\S]*?)<\/div>/);
    const name = m ? clean(m[1]) : html.match(/<h1 class="postTitle[^"]*"[^>]*>([\s\S]*?)<\/h1>/)?.[1];
    const reading = m ? clean(m[2]).split(/[／/]/).pop().trim() : null;
    return {
        name: name ? clean(name) : null,
        reading: reading && /[ァ-ヺぁ-ゖ]/.test(reading) ? reading : null,
    };
}

// ---------- 画像 ----------

// 公式サイトの画像 URL はファイル名がハッシュなので、変わったときだけ再ダウンロードする
function imageVersion(url) {
    return url.match(/([0-9a-f]{8})[0-9a-f]*\.\w+$/)?.[1] ?? "0";
}

async function saveImage(url, fileName, previousVersion, used) {
    const version = imageVersion(url);
    used.add(fileName);
    const path = join(IMAGE_DIR, fileName);
    let exists = true;
    try { await readFile(path); } catch { exists = false; }
    if (!exists || previousVersion !== version) {
        const buf = await fetchWithRetry(new URL(url, BASE).href, true);
        await writeFile(path, buf);
        console.log(`  画像を保存: ${fileName}`);
    }
    return `images/auto/${fileName}?v=${version}`;
}

// ---------- data.js の読み書き ----------

const DATA_HEADER = `// ハロプロ タイピングゲーム - メンバーデータ
// このファイルは scripts/update-members.mjs が公式サイトから自動生成している。手で編集しても次回の更新で上書きされる。
// ローマ字を変えたいときは scripts/update-members.mjs の ROMAJI_OVERRIDES に書く。
// romaji はそのままタイピング目標文字列として使用する(大文字小文字は無視)
`;

async function loadPrevious() {
    try {
        const text = await readFile(DATA_FILE, "utf8");
        const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
        return JSON.parse(json);
    } catch {
        return []; // 初回 (手書きの data.js は JSON として読めないので、全員分を新しく作る)
    }
}

async function main() {
    const previous = await loadPrevious();
    const prevVersion = (path) => path?.match(/\?v=(\w+)/)?.[1];
    const prevGroups = Object.fromEntries(previous.map((g) => [g.id, g]));

    await mkdir(IMAGE_DIR, { recursive: true });
    const used = new Set();
    const groups = [];

    for (const g of await discoverGroups()) {
        console.log(`[${g.slug}]`);
        const html = await fetchWithRetry(`${BASE}/${g.slug}/`);
        const page = parseGroupPage(html, g.slug);
        if (!page.name || page.members.length === 0) {
            throw new Error(`${g.slug}: グループページを解析できませんでした (サイトの構造が変わった可能性)`);
        }

        const prev = prevGroups[g.id];
        const prevMembers = Object.fromEntries((prev?.members ?? []).map((m) => [m.id, m]));

        const members = [];
        for (const m of page.members) {
            const detail = parseMemberPage(await fetchWithRetry(`${BASE}/${g.slug}/${m.id}/`));
            if (!detail.name) throw new Error(`${g.slug}/${m.id}: 名前を取得できませんでした`);

            let romaji = ROMAJI_OVERRIDES[`${g.slug}/${m.id}`]
                ?? (detail.reading && kanaToRomaji(detail.reading));
            if (!romaji) {
                romaji = prevMembers[m.id]?.romaji ?? slugToRomaji(m.id);
                console.warn(`  ⚠ ${detail.name}: よみがな「${detail.reading ?? "なし"}」をローマ字にできなかったため "${romaji}" を使います`);
            }
            console.log(`  ${detail.name} (${detail.reading ?? "?"}) → ${romaji}`);

            members.push({
                id: m.id,
                name: detail.name,
                romaji,
                image: await saveImage(m.thumb, `${g.id}_${m.id}.webp`, prevVersion(prevMembers[m.id]?.image), used),
            });
        }

        const groupImage = g.image ?? page.groupImage;
        const image = groupImage
            ? await saveImage(groupImage, `group_${g.id}.webp`, prevVersion(prev?.image), used)
            : prev?.image ?? null;
        const color = g.color ?? prev?.color ?? "#888888";

        groups.push({ id: g.id, name: page.name, color, image, members });
    }

    // 安全装置: 前回から極端にメンバーが減っていたら、サイト側の不具合とみなして更新しない
    const total = (gs) => gs.reduce((n, g) => n + g.members.length, 0);
    if (total(previous) > 0 && total(groups) < total(previous) * 0.6) {
        throw new Error(`メンバー数が ${total(previous)} → ${total(groups)} に急減したため更新を中止しました`);
    }

    // 卒業などで使われなくなった画像を削除
    for (const file of await readdir(IMAGE_DIR)) {
        if (!used.has(file)) {
            await rm(join(IMAGE_DIR, file));
            console.log(`画像を削除: ${file}`);
        }
    }

    if (JSON.stringify(groups) === JSON.stringify(previous)) {
        console.log("変更なし");
        return;
    }
    await writeFile(DATA_FILE, `${DATA_HEADER}\nconst GROUPS = ${JSON.stringify(groups, null, 2)};\n`);
    console.log(`data.js を更新しました (${total(groups)}人)`);
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
