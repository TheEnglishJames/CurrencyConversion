import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const RATE_FILE = new URL('../rate.json', import.meta.url);
const VISA_BASE = 'https://www.visa.co.uk/cmsapi/fx/rates';
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const plausible = (r) => Number.isFinite(r) && r > 0.02 && r < 0.15;
const isoDay = (d) => d.toISOString().slice(0, 10);

async function visaOn(date) {
  const mdy = encodeURIComponent(
    `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`,
  );
  const url = `${VISA_BASE}?amount=1&fee=0&utcConvertedDate=${mdy}&exchangedate=${mdy}&fromCurr=EUR&toCurr=ZAR`;
  // Visa antwortet auf Nodes fetch mit 403 (TLS-Fingerprint); curl wird durchgelassen.
  const { stdout } = await run(
    'curl',
    ['-sS', '--fail', '--max-time', '20', '-A', UA, '-H', 'Accept: application/json', url],
    { timeout: 25000 },
  );
  const body = JSON.parse(stdout);
  const v = body?.originalValues;
  const rate = Number(v?.fxRateVisa);
  if (body?.status !== 'success' || !(rate > 0)) throw new Error('Visa: keine gültige Antwort');
  if (!plausible(rate)) throw new Error(`Visa: Kurs unplausibel (${rate})`);
  return { eurPerZar: rate, source: 'visa', asOf: isoDay(new Date(v.asOfDate * 1000)) };
}

async function visa() {
  const today = new Date();
  try {
    return await visaOn(today);
  } catch (e) {
    console.warn(`Visa (heute) fehlgeschlagen: ${e.message}; versuche gestern`);
    return await visaOn(new Date(today.getTime() - 86400000));
  }
}

async function ecb() {
  const res = await fetch(ECB_URL, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`EZB HTTP ${res.status}`);
  const xml = await res.text();
  const rate = Number(xml.match(/currency=['"]ZAR['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
  const asOf = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!(rate > 0) || !asOf) throw new Error('EZB: ZAR/Datum nicht gefunden');
  const eurPerZar = 1 / rate;
  if (!plausible(eurPerZar)) throw new Error(`EZB: Kurs unplausibel (${eurPerZar})`);
  return { eurPerZar, source: 'ecb', asOf };
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

if (old.eurPerZar === result.eurPerZar && old.asOf === result.asOf) {
  console.log('Unverändert:', result);
} else {
  const out = { ...result, fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
  await writeFile(RATE_FILE, JSON.stringify(out, null, 2) + '\n');
  console.log('Geschrieben:', out);
}
