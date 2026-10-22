# Rand Rate

Offline-fähige PWA: ZAR ⇄ EUR oder ZAR ⇄ USD zum EZB-Referenzkurs (Kartenwährung per €/$-Schalter wählbar, wird gemerkt). Die Oberfläche ist englisch. Der Kurs wird dreimal täglich (06:00, 14:00, 15:00 UTC) per GitHub Action nach `rate.json` geschrieben und ändert sich nur, wenn die EZB einen neuen Kurs veröffentlicht (einmal pro Werktag, ca. 16:00 MEZ). Der ⟳-Knopf in der App lädt die App neu und holt den aktuellen Kurs. Gehostet nur auf GitHub Pages; der Push der Action löst den Pages-Build automatisch aus.

Visa wird nicht mehr abgefragt: Visa antwortet den GitHub-Runnern auf allen Hosts mit 403. Der EZB-Kurs liegt ca. 0,2 % unter dem Visa-Kurs.

App-Adresse: https://theenglishjames.github.io/CurrencyConversion/

## App installieren

Einmal online öffnen, danach funktioniert die App auch ohne Netz.

### Android (Chrome)
1. Die Adresse oben in **Chrome** öffnen.
2. Menü **⋮** (oben rechts) → **App installieren** (oder „Zum Startbildschirm hinzufügen“).
3. Mit **Installieren** bestätigen. Die App „Rand Rate“ liegt jetzt auf dem Startbildschirm.

### iPhone / iPad (Safari)
1. Die Adresse in **Safari** öffnen (andere Browser können das auf iOS meist nicht).
2. **Teilen**-Symbol (Quadrat mit Pfeil nach oben) → **Zum Home-Bildschirm**.
3. Name prüfen, **Hinzufügen** tippen.

### Windows / Mac / Linux (Chrome oder Edge)
1. Die Adresse öffnen.
2. Chrome: Installieren-Symbol rechts in der Adressleiste oder Menü **⋮** → **Speichern und teilen** → **Seite als App installieren**.
   Edge: Menü **…** → **Apps** → **Diese Website als App installieren**.
3. Die App startet danach in einem eigenen Fenster, mit Verknüpfung auf dem Desktop oder im Startmenü.

Safari am Mac: **Teilen** → **Zum Dock hinzufügen**.

## Setup (Entwickler)

1. Neues GitHub-Repo anlegen (public, damit Pages kostenlos ist).
2. Lokales Repo pushen: `git remote add origin <URL>` und `git push -u origin main`.
3. Settings → Pages → Source: Branch `main`, Ordner `/ (root)`.
4. Actions → „Update rate“ → „Run workflow“ einmal manuell starten und prüfen, ob in `rate.json` `"source": "ecb"` steht.
