# Simulation des Lernsystems

Virtuelle Lerner üben mit der echten Lernlogik (`derive`, `Round`, `PlacementRun`), nur ohne Bildschirme.

```
npm run sim -- 56 3            # 56 Tage, 3 Zufalls-Seeds je Kombination
npm run sim -- 56 3 stark      # nur Profile/Gewohnheiten, die "stark" enthalten
```

- `simulate.ts`: Lernermodell (Vorwissen, Lernen, Vergessen, Flüchtigkeitsfehler, Denkzeit) und ein Lauf über mehrere Wochen.
- `report.ts`: Tabellen zu Freischalten/Meistern, Rundenzusammensetzung, Hängern, schwachen Fakten, Rückfällen und Fehlern.

Profile: stark, mittel, schwach, luecken-7x8 (6 schwere Fakten fehlen), langsam-genau, rater.
Gewohnheiten: täglich 1 Runde, täglich 3 Runden, unregelmäßig, 10 Tage Pause.

Das Lernermodell ist eine grobe Annahme. Aussagekräftig sind Vergleiche (vorher/nachher) und Hänger, keine exakten Tage.
