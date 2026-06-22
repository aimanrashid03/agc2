/**
 * Turn a wall of legal narrative text into readable paragraphs.
 *
 * The seed data (LKK_CASE_FACT, LKK_GROUNDS_OF_JUDGEMENT, LLA_CHARGE_NOTES, …) is stored
 * as one continuous run of sentences with NO paragraph breaks, so `whitespace-pre-wrap`
 * renders an unreadable block. This pure helper inserts structure only — it never deletes
 * or rewrites words (verified: re-joining the paragraphs reproduces the normalized input).
 *
 * Strategy: respect any existing blank-line paragraphs; for blocks that are still a wall,
 * split into sentences (abbreviation- and decimal-aware so dates like `16/4/2022`, money
 * like `RM1,000.00`, and `No. B-21-2A` are NOT mis-split) and regroup them into paragraphs
 * of ~TARGET characters.
 */

const TARGET = 300; // approx chars per paragraph
const KEEP_WHOLE = TARGET * 1.3; // blocks at/under this stay as a single paragraph
const ORPHAN = 80; // a trailing remainder shorter than this is merged into the previous para

// Lowercase words that end in "." but are NOT sentence boundaries (common in MY legal text).
const ABBREV = new Set([
    'no', 'sdn', 'bhd', 'dr', 'en', 'tn', 'pn', 'hj', 'hjh', 'dato', 'datuk',
    'tuan', 'puan', 'bil', 'hlm', 'ms', 'cth', 'drp', 'dlm', 'sek',
]);

function splitSentences(text: string): string[] {
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch !== '.' && ch !== '?' && ch !== '!') continue;

        const next = text[i + 1];
        if (next !== ' ' && next !== '\n' && next !== '\t') continue;

        // Find the first non-space char after the punctuation; a real sentence starts with
        // an uppercase letter, digit, or an opening quote/bracket.
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        const starter = text[j];
        if (!starter || !/[A-Z0-9"“'(]/.test(starter)) continue;

        const prevChar = text[i - 1] || '';
        const lastWord = (text.slice(start, i).match(/(\S+)$/)?.[1] || '')
            .replace(/[^A-Za-z]/g, '')
            .toLowerCase();
        const isDecimal = ch === '.' && /[0-9]/.test(prevChar) && /[0-9]/.test(starter);

        if (ABBREV.has(lastWord) || lastWord.length <= 1 || isDecimal) continue;

        out.push(text.slice(start, i + 1).trim());
        start = j;
        i = j - 1;
    }
    if (start < text.length) out.push(text.slice(start).trim());
    return out.filter(Boolean);
}

export function formatProse(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const text = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
    if (!text) return [];

    // Honor existing blank-line paragraphs if the author left any.
    const blocks = text
        .split(/\n\s*\n/)
        .map((b) => b.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    const source = blocks.length > 1 ? blocks : [text.replace(/\s+/g, ' ').trim()];

    const paragraphs: string[] = [];
    for (const block of source) {
        if (block.length <= KEEP_WHOLE) {
            paragraphs.push(block);
            continue;
        }
        let buf = '';
        for (const sentence of splitSentences(block)) {
            buf = buf ? `${buf} ${sentence}` : sentence;
            if (buf.length >= TARGET) {
                paragraphs.push(buf);
                buf = '';
            }
        }
        if (buf) {
            if (buf.length < ORPHAN && paragraphs.length) {
                paragraphs[paragraphs.length - 1] += ` ${buf}`;
            } else {
                paragraphs.push(buf);
            }
        }
    }
    return paragraphs;
}
