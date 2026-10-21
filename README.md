# Rand ⇄ Euro – Umrechner

Offline-fähige PWA: ZAR ⇄ EUR zum Visa-Kurs. Der Kurs wird zweimal täglich per GitHub Action nach `rate.json` geschrieben (Fallback: EZB).

## Setup

1. Neues GitHub-Repo anlegen (public, damit Pages kostenlos ist).
2. Lokales Repo pushen: `git remote add origin <URL>` und `git push -u origin main`.
3. Settings → Pages → Source: Branch `main`, Ordner `/ (root)`.
4. Actions → „Update rate“ → „Run workflow“ einmal manuell starten und prüfen, ob in `rate.json` `"source": "visa"` steht.
5. URL in Chrome auf dem Android-Handy öffnen → Menü → „Zum Startbildschirm hinzufügen“.
