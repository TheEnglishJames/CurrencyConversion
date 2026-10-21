# Rand ⇄ Euro – Umrechner (PWA)

Implementierungsauftrag. Alles hier ist entschieden; nicht neu verhandeln, keine Zusatzfeatures.

## Ziel

Schlanke, offline-fähige Web-App (PWA, Android/Chrome) für eine Südafrika-Reise. Nutzer tippt einen Betrag ein und sieht sofort den Gegenwert zum **Visa-Kurs**, in beide Richtungen (ZAR → EUR, EUR → ZAR). Keine Bankgebühr (Auslandseinsatzentgelt = 0), keine Ausgabenliste, kein Tracking – **nur Umrechnung**.

## Architektur

```
GitHub Action (täglich) ──► scripts/fetch-rate.mjs ──► rate.json (committed)
                                                          │
GitHub Pages ──► index.html + sw.js + manifest ◄──────────┘ (fetch, offline gecacht)
```

- Kein Backend, kein Build-Schritt, keine npm-Abhängigkeiten. Node ≥ 20 (eingebautes `fetch`).
- Der Browser ruft Visa **nie** direkt auf (CORS + Bot-Schutz). Nur die Action tut das.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | UI, CSS und JS inline |
| `manifest.webmanifest` | PWA-Manifest |
| `sw.js` | Service Worker |
| `icon.svg`, `icon-192.png`, `icon-512.png` | App-Icon (PNG-Pflicht für Android-Installation; `purpose: "any maskable"`) |
| `rate.json` | aktueller Kurs (von der Action geschrieben; initial mit dem Beispielwert unten committen) |
| `scripts/fetch-rate.mjs` | holt Kurs, schreibt `rate.json` |
| `.github/workflows/update-rate.yml` | Zeitplan + Commit |
| `README.md` | kurz: Setup-Schritte für den Nutzer (siehe unten) |

## Kursquelle 1: Visa (primär)

Inoffizieller Endpunkt hinter dem Visa-Währungsrechner. Am 2026-10-21 per curl verifiziert:

```
GET https://www.visa.co.uk/cmsapi/fx/rates?amount=1&fee=0
    &utcConvertedDate=10%2F21%2F2026&exchangedate=10%2F21%2F2026
    &fromCurr=EUR&toCurr=ZAR
Header: User-Agent: <normaler Desktop-Chrome-UA>, Accept: application/json
```

Antwort (gekürzt, echt):

```json
{
  "originalValues": {
    "fromCurrency": "ZAR", "toCurrency": "EUR",
    "asOfDate": 1792540800,
    "fxRateVisa": "0.0544131165",
    "benchmarks": [{ "benchmarkSystem": "ECB", "benchmarkFxRate": "0.0541216330" }]
  },
  "status": "success"
}
```

**Achtung, Semantik:** `fromCurr=EUR&toCurr=ZAR` heißt „Karte in EUR, Zahlung in ZAR“. `originalValues.fxRateVisa` ist **EUR pro 1 ZAR**. Genau diesen Wert verwenden. `asOfDate` ist Unix-Sekunden.

Regeln:
- Datum = heute (UTC) im Format `MM/DD/YYYY`, URL-encodiert. Wenn die Antwort nicht `status: "success"` hat oder `fxRateVisa` fehlt/nicht > 0 ist: einmal mit gestrigem Datum wiederholen.
- Plausibilitätsprüfung: 0,02 < Kurs < 0,15. Sonst als Fehler behandeln.
- Timeout 20 s.

## Kursquelle 2: EZB (Fallback)

Nur wenn Visa scheitert: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, Eintrag `<Cube currency='ZAR' rate='…'/>` (= ZAR pro 1 EUR) → `1 / rate` = EUR pro ZAR. Datum aus `<Cube time='YYYY-MM-DD'>`. Per Regex parsen, kein XML-Paket.

Scheitern beide: `rate.json` **nicht** anfassen, Warnung loggen, Exit-Code 1 (damit die Action rot wird und der Nutzer es sieht). Der alte Kurs bleibt gültig.

## `rate.json`

```json
{
  "eurPerZar": 0.0544131165,
  "source": "visa",
  "asOf": "2026-10-20",
  "fetchedAt": "2026-10-21T06:00:12Z"
}
```

`source` ist `"visa"` oder `"ecb"`. `asOf` = Kursdatum (aus `asOfDate` bzw. EZB-`time`), `fetchedAt` = Abrufzeit. Datei nur schreiben, wenn sich `eurPerZar` oder `asOf` geändert hat (vermeidet leere Commits).

## GitHub Action

- Trigger: `schedule` zweimal täglich (`0 6 * * *` und `0 14 * * *` UTC) + `workflow_dispatch`.
- `permissions: contents: write`.
- Schritte: checkout → setup-node 20 → `node scripts/fetch-rate.mjs` → falls `git diff --quiet rate.json` fehlschlägt: commit „Update rate“ als `github-actions[bot]` und push.
- Hinweis: Es ist **nicht getestet**, ob Visa die GitHub-Runner-IPs blockt. Falls ja, greift der EZB-Fallback automatisch; nichts weiter tun.

## UI (`index.html`)

Sprache Deutsch, `lang="de"`. Mobile first, eine Spalte, System-Font, Hell/Dunkel per `prefers-color-scheme`.

Von oben nach unten:
1. **Eingabefeld**, groß (≥ 2 rem), `inputmode="decimal"`, Autofokus beim Öffnen. Komma **und** Punkt als Dezimaltrenner akzeptieren. Währungslabel daneben (`ZAR` bzw. `EUR`).
2. **Tausch-Button** ⇅: wechselt die Richtung; der bisher angezeigte Ergebnisbetrag wird zum neuen Eingabewert. Standardrichtung ZAR → EUR. Letzte Richtung in `localStorage` merken (try/catch).
3. **Ergebnis**, sehr groß, live bei jeder Eingabe. Formatierung `Intl.NumberFormat('de-DE', { style: 'currency', currency })` mit 2 Nachkommastellen. Leere/ungültige Eingabe → „–“.
4. **Kurszeile**, klein: `1 ZAR = 0,0544 € · 1 € = 18,38 ZAR · Visa, Stand 20.10.2026`. Bei `source: "ecb"`: „EZB (Näherung, Visa nicht verfügbar)“.
5. **Warnung**, nur wenn nötig: `asOf` älter als 3 Tage → „Kurs ist veraltet“. Offline → „Offline – letzter gespeicherter Kurs“.
6. **Hinweis**, dezent, ganz unten: „Am Terminal immer in ZAR bezahlen, nicht in EUR.“

Rechnung: ZAR → EUR = Betrag × `eurPerZar`; EUR → ZAR = Betrag ÷ `eurPerZar`.

Kurs laden: `fetch('rate.json', { cache: 'no-store' })`; bei Fehler den zuletzt in `localStorage` gespeicherten Kurs verwenden; gibt es keinen, Meldung „Noch kein Kurs geladen – einmal online öffnen“.

## Service Worker

- Install: App-Shell precachen (`./`, `index.html`, `manifest.webmanifest`, Icons). Cache-Name mit Versionsnummer; alte Caches im `activate` löschen.
- `rate.json`: network-first, Fallback Cache.
- Alles andere: cache-first.
- Alle Pfade **relativ** (GitHub Pages läuft unter `/<repo-name>/`). Manifest `start_url: "./"`, `scope: "./"`, `display: "standalone"`.

## Setup-Schritte für den Nutzer (in README.md)

`gh` ist nicht installiert, der Nutzer macht das im Browser:
1. Neues GitHub-Repo anlegen (public, damit Pages kostenlos ist).
2. Lokales Repo pushen (`git remote add origin …`, `git push -u origin main`).
3. Settings → Pages → Source: Branch `main`, Ordner `/ (root)`.
4. Actions → „Update rate“ → „Run workflow“ einmal manuell starten und prüfen, ob `source: "visa"` herauskommt.
5. URL in Chrome auf dem Android-Handy öffnen → Menü → „Zum Startbildschirm hinzufügen“.

## Abnahme (vor Übergabe selbst prüfen)

- [ ] `node scripts/fetch-rate.mjs` lokal → `rate.json` mit `source: "visa"`, Kurs plausibel.
- [ ] Visa-URL absichtlich kaputt machen → Fallback schreibt `source: "ecb"`. Danach zurückbauen.
- [ ] Lokal ausliefern (`npx serve` o. ä.), im Browser: 1000 ZAR ≈ 54,41 € beim Beispielkurs; Tausch-Button; Komma-Eingabe `12,5`.
- [ ] Chrome DevTools → Application: Manifest ohne Fehler, Service Worker aktiv; Network auf „Offline“ → App lädt und rechnet weiter.
- [ ] `git init`, alles auf `main` committen. **Nicht** pushen (Remote existiert noch nicht).
