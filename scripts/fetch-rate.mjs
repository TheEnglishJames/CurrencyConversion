import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const RATE_FILE = new URL('../rate.json', import.meta.url);
const VISA_BASE = 'https://www.visa.co.uk/cmsapi/fx/rates';
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// EUR und USD pro ZAR liegen beide um 0,05–0,07
const plausible = (r) => Number.isFinite(r) && r > 0.02 && r < 0.15;
const isoDay = (d) => d.toISOString().slice(0, 10);

// Kartenwährung `card` (EUR/USD), Zahlung in ZAR → fxRateVisa = card pro 1 ZAR
async function visaOn(date, card) {
  const mdy = encodeURIComponent(
    `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`,
  );
  const url = `${VISA_BASE}?amount=1&fee=0&utcConvertedDate=${mdy}&exchangedate=${mdy}&fromCurr=${card}&toCurr=ZAR`;
  // Visa antwortet auf Nodes fetch mit 403 (TLS-Fingerprint); curl wird durchgelassen.
  const { stdout } = await run(
    'curl',
    ['-sS', '--fail', '--max-time', '20', '-A', UA, '-H', 'Accept: application/json', url],
    { timeout: 25000 },
  );
  const body = JSON.parse(stdout);
  const v = body?.originalValues;
  const rate = Number(v?.fxRateVisa);
  if (body?.status !== 'success' || !(rate > 0)) throw new Error(`Visa ${card}: keine gültige Antwort`);
  if (!plausible(rate)) throw new Error(`Visa ${card}: Kurs unplausibel (${rate})`);
  return { rate, asOf: isoDay(new Date(v.asOfDate * 1000)) };
}

async function visaFor(card) {
  const today = new Date();
  try {
    return await visaOn(today, card);
  } catch (e) {
    console.warn(`Visa ${card} (heute) fehlgeschlagen: ${e.message}; versuche gestern`);
    return await visaOn(new Date(today.getTime() - 86400000), card);
  }
}

// Beide Kurse aus derselben Quelle, damit Quelle und Stand für beide stimmen
async function visa() {
  const [eur, usd] = await Promise.all([visaFor('EUR'), visaFor('USD')]);
  return { eurPerZar: eur.rate, usdPerZar: usd.rate, source: 'visa', asOf: eur.asOf };
}

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

let result;
try {
  result = await visa();
} catch (e) {
  console.warn(`Visa fehlgeschlagen: ${e.message}; Fallback EZB`);
  try {
    result = await ecb();
  } catch (e2) {
    console.warn(`WARNUNG: Auch EZB fehlgeschlagen: ${e2.message}. rate.json bleibt unverändert.`);
    process.exit(1);
  }
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
