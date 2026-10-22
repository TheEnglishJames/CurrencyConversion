# Rand ⇄ Euro – Umrechner (PWA)

> **Stand 2026-10-22:** Visa ist nicht mehr angebunden (403 auf allen Hosts von den GitHub-Runnern). Einzige Kursquelle ist die EZB; die Oberfläche ist englisch. Die Abschnitte zu Visa unten sind nur noch Historie und gelten nicht mehr.

Implementierungsauftrag. Alles hier ist entschieden; nicht neu verhandeln, keine Zusatzfeatures.

## Ziel

Schlanke, offline-fähige Web-App (PWA, Android/Chrome) für eine Südafrika-Reise. Nutzer tippt einen Betrag ein und sieht sofort den Gegenwert zum Kurs (inzwischen EZB-Referenzkurs, siehe Hinweis oben), in beide Richtungen (ZAR → EUR, EUR → ZAR). Keine Bankgebühr (Auslandseinsatzentgelt = 0), keine Ausgabenliste, kein Tracking – **nur Umrechnung**.

## Architektur

```
GitHub Action (täglich) ──► scripts/fetch-rate.mjs ──► rate.json (committed)
                                                          │
GitHub Pages ──► index.html + sw.js + manifest ◄──────────┘ (fetch, offline gecacht)
```

- Kein Backend, kein Build-Schritt, keine npm-Abhängigkeiten. Node ≥ 20 (eingebautes `fetch`).
- Der Browser ruft die Kursquelle **nie** direkt auf; nur die Action holt den Kurs.

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

## Kursquelle 1: Visa (entfernt, nur Historie)

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

## Kursquelle: EZB (einzige Quelle)

`https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, Eintrag `<Cube currency='ZAR' rate='…'/>` (= ZAR pro 1 EUR) → `1 / rate` = EUR pro ZAR. Datum aus `<Cube time='YYYY-MM-DD'>`. Per Regex parsen, kein XML-Paket.

Scheitert die EZB: `rate.json` **nicht** anfassen, Warnung loggen, Exit-Code 1 (damit die Action rot wird und der Nutzer es sieht). Der alte Kurs bleibt gültig.

## `rate.json`

Nachtrag: Zusätzlich `usdPerZar` (Visa mit `fromCurr=USD`, EZB-Fallback als Kreuzkurs USD/ZAR). Beide Werte stammen immer aus derselben Quelle. Die App hat einen €/$-Schalter „Kartenwährung“ (`localStorage` `home`); Hosting nur GitHub Pages.

```json
{
  "eurPerZar": 0.0544131165,
  "usdPerZar": 0.0611878408,
  "source": "visa",
  "asOf": "2026-10-20",
  "fetchedAt": "2026-10-21T06:00:12Z"
}
```

`source` ist `"ecb"` (die App kennt noch `"visa"` für alte Dateien). `asOf` = Kursdatum (aus `asOfDate` bzw. EZB-`time`), `fetchedAt` = Abrufzeit. Datei nur schreiben, wenn sich `eurPerZar` oder `asOf` geändert hat (vermeidet leere Commits).

## GitHub Action

- Trigger: `schedule` dreimal täglich (`0 6 * * *`, `0 14 * * *`, `0 15 * * *` UTC; die EZB veröffentlicht um 16:00 MEZ, also 14:00 bzw. 15:00 UTC) + `workflow_dispatch`.
- `permissions: contents: write`.
- Schritte: checkout → setup-node 20 → `node scripts/fetch-rate.mjs` → falls `git diff --quiet rate.json` fehlschlägt: commit „Update rate“ als `github-actions[bot]` und push.
- Visa blockt die GitHub-Runner-IPs (403 auf `visa.co.uk`, `usa.visa.com`, `visa.de`, `visa.co.za`, `visa.ca`), daher nur EZB.

## UI (`index.html`)

Sprache Englisch, `lang="en"`; Zahlen mit `en-GB`. Mobile first, eine Spalte, System-Font, Hell/Dunkel per `prefers-color-scheme`.

Von oben nach unten:
1. **Eingabefeld**, groß (≥ 2 rem), `inputmode="decimal"`, Autofokus beim Öffnen. Komma **und** Punkt als Dezimaltrenner akzeptieren. Währungslabel daneben (`ZAR` bzw. `EUR`).
2. **Tausch-Button** ⇅: wechselt die Richtung; der bisher angezeigte Ergebnisbetrag wird zum neuen Eingabewert. Standardrichtung ZAR → EUR. Letzte Richtung in `localStorage` merken (try/catch).
3. **Ergebnis**, sehr groß, live bei jeder Eingabe. Formatierung `Intl.NumberFormat('en-GB', { style: 'currency', currency })` mit 2 Nachkommastellen. Leere/ungültige Eingabe → „–“.
4. **Kurszeile**, klein: `1 ZAR = 0.0544 € · 1 € = 18.38 ZAR · ECB, as of 21/10/2026`.
5. **Warnung**, nur wenn nötig: `asOf` älter als 3 Tage → „Rate is outdated“. Offline → „Offline – last saved rate“.
6. **Hinweis** unter der Kurszeile: „The rate is the ECB reference rate and only changes when the ECB publishes a new one (once per working day, around 16:00 CET).“
7. **Neu-laden-Knopf** ⟳ in der Kopfzeile: stößt ein Service-Worker-Update an und lädt die Seite neu (Start und `rate.json` sind network-first).

Rechnung: ZAR → EUR = Betrag × `eurPerZar`; EUR → ZAR = Betrag ÷ `eurPerZar`.

Kurs laden: `fetch('rate.json', { cache: 'no-store' })`; bei Fehler den zuletzt in `localStorage` gespeicherten Kurs verwenden; gibt es keinen, Meldung „No rate loaded yet – open once while online“.

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
4. Actions → „Update rate“ → „Run workflow“ einmal manuell starten und prüfen, ob `source: "ecb"` herauskommt.
5. URL in Chrome auf dem Android-Handy öffnen → Menü → „Zum Startbildschirm hinzufügen“.

## Abnahme (vor Übergabe selbst prüfen)

- [ ] `node scripts/fetch-rate.mjs` lokal → `rate.json` mit `source: "ecb"`, Kurs plausibel.
- [ ] Lokal ausliefern (`npx serve` o. ä.), im Browser: 1000 ZAR ≈ 54,41 € beim Beispielkurs; Tausch-Button; Komma-Eingabe `12,5` und Punkt-Eingabe `12.5`.
- [ ] Chrome DevTools → Application: Manifest ohne Fehler, Service Worker aktiv; Network auf „Offline“ → App lädt und rechnet weiter.
- [ ] `git init`, alles auf `main` committen. **Nicht** pushen (Remote existiert noch nicht).
