import { readFile, writeFile } from 'node:fs/promises';

const RATE_FILE = new URL('../rate.json', import.meta.url);
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

// EUR und USD pro ZAR liegen beide um 0,05–0,07
const plausible = (r) => Number.isFinite(r) && r > 0.02 && r < 0.15;

async function ecb() {
  const res = await fetch(ECB_URL, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`EZB HTTP ${res.status}`);
  const xml = await res.text();
  // EZB-Kurse sind „Währung pro 1 EUR“
  const perEur = Object.fromEntries(
    [...xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)].map((m) => [m[1], Number(m[2])]),
  );
  const zar = perEur.ZAR;
  const usd = perEur.USD;
  const asOf = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!(zar > 0) || !(usd > 0) || !asOf) throw new Error('EZB: ZAR/USD/Datum nicht gefunden');
  const eurPerZar = 1 / zar;
  const usdPerZar = usd / zar;
  if (!plausible(eurPerZar) || !plausible(usdPerZar)) throw new Error(`EZB: Kurs unplausibel (${eurPerZar}, ${usdPerZar})`);
  return { eurPerZar, usdPerZar, source: 'ecb', asOf };
}

// Visa blockt die GitHub-Runner (403 auf allen Hosts), daher nur der EZB-Referenzkurs
let result;
try {
  result = await ecb();
} catch (e) {
  console.warn(`WARNUNG: EZB fehlgeschlagen: ${e.message}. rate.json bleibt unverändert.`);
  process.exit(1);
}

let old = {};
try { old = JSON.parse(await readFile(RATE_FILE, 'utf8')); } catch {}

if (old.eurPerZar === result.eurPerZar && old.usdPerZar === result.usdPerZar && old.asOf === result.asOf) {
  console.log('Unverändert:', result);
} else {
  const out = { ...result, fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
  await writeFile(RATE_FILE, JSON.stringify(out, null, 2) + '\n');
  console.log('Geschrieben:', out);
}
