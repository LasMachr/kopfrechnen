# Kopfrechnen

Web-App fürs iPhone, um Kopfrechnen und logisches Denken zu trainieren. Läuft komplett auf dem Gerät, offline, ohne Konto.

**App:** https://lasmachr.github.io/kopfrechnen/ (in Safari öffnen, dann „Teilen“ → „Zum Home-Bildschirm“)

## Erste Version

- Großer Knopf „Runde starten“: 5-Minuten-Runden, die App mischt fällige Wiederholungen, neuen Stoff und alte Aufgaben
- Kurzer Einstufungstest beim ersten Start
- Stufe 1 (1.1 bis 1.8, 1.A bis 1.C), Stufe 2 (2.1 bis 2.7), Schätzen (3.1)
- Tipp-Karten mit geführten Beispielen, Fehler-Feedback in zwei Stufen
- Leitner-Wiederholung mit 5 Fächern, Meistern frühestens nach 7 Tagen
- Fortschritt mit Einmaleins-Raster, Backup über das Teilen-Menü

## Entwicklung

```sh
npm install
npm run dev      # lokal starten, im Browser mit ?browser am Ende der Adresse
npm test         # Tests für Generatoren und Lernlogik
npm run check    # Typen prüfen
npm run build
```

Technik: Svelte 5, Vite, TypeScript, vite-plugin-pwa, IndexedDB über Dexie, Vitest. Jeder Push auf `main` wird getestet und über GitHub Actions auf GitHub Pages veröffentlicht.
