// Kapitel: Die bisherigen Level werden zu 10 Kapiteln mit je 1 bis 4 Abschnitten.
// Intern bleiben die Level-IDs (z. B. "1.7"), damit gespeicherte Daten gültig bleiben.

export interface Chapter {
  id: number;
  name: string;
  about: string; // „Worum es geht“, 2 Sätze
  sections: string[]; // Level-IDs in Reihenfolge
  buildsOn: number[]; // Kapitel, auf die es aufbaut
}

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    name: 'Kleines Einmaleins',
    about: 'Das kleine Einmaleins ist das Fundament für alles andere. Ziel ist Abrufen statt Rechnen.',
    sections: ['1.1'],
    buildsOn: []
  },
  {
    id: 2,
    name: 'Plus & Minus',
    about: 'Zwei- und dreistellige Zahlen mit Zehnerübergang. Runden und Ausgleichen macht es schnell und sicher.',
    sections: ['1.A'],
    buildsOn: []
  },
  {
    id: 3,
    name: 'Malnehmen im Kopf',
    about: 'Größere Zahlen malnehmen, indem man sie in Zehner und Einer zerlegt. Eine Methode gründlich statt viele halb.',
    sections: ['1.3', '1.5', '1.6', '1.7'],
    buildsOn: [1]
  },
  {
    id: 4,
    name: 'Rechentricks',
    about: 'Abkürzungen für besondere Zahlen wie ×5, ×25, ×11 oder 47·53. Dazu gehört auch zu erkennen, wann ein Trick nicht passt.',
    sections: ['1.4', '1.8'],
    buildsOn: [1, 3]
  },
  {
    id: 5,
    name: 'Teilen',
    about: 'Dreistellige Zahlen durch einstellige teilen, auch mit Rest als Kommazahl. Zerlegen in gut teilbare Teile ist der Schlüssel.',
    sections: ['1.C'],
    buildsOn: [1]
  },
  {
    id: 6,
    name: 'Kommazahlen',
    about: 'Plus, minus, mal und geteilt mit Dezimalzahlen. Ohne Komma rechnen und die Stellen danach richtig setzen.',
    sections: ['1.B'],
    buildsOn: [1, 2]
  },
  {
    id: 7,
    name: 'Großes Einmaleins',
    about: 'Das Einmaleins bis 20 und die Quadrate bis 25. Viel davon lässt sich aus dem kleinen Einmaleins zusammensetzen, der Rest wird auswendig gelernt.',
    sections: ['1.2'],
    buildsOn: [1]
  },
  {
    id: 8,
    name: 'Brüche',
    about: 'Brüche kürzen, vergleichen und mit ihnen rechnen. Dazu die wichtigsten Brüche als Prozent und Dezimalzahl auswendig.',
    sections: ['2.1', '2.2'],
    buildsOn: [1, 5]
  },
  {
    id: 9,
    name: 'Prozent',
    about: 'Prozentwert, Grundwert, Veränderungen und Prozentpunkte. Das ist der Kern der HSG-Tabellenaufgaben.',
    sections: ['2.3', '2.4', '2.5', '2.6'],
    buildsOn: [6, 8]
  },
  {
    id: 10,
    name: 'Große Zahlen & Schätzen',
    about: 'Mit Millionen und Milliarden rechnen und Ergebnisse schnell überschlagen. Erst klein rechnen, dann Nullen zählen.',
    sections: ['2.7', '3.1'],
    buildsOn: [3, 5, 9]
  }
];

export const chapterById = new Map(CHAPTERS.map((c) => [c.id, c]));
export const chapterOfLevel = new Map<string, Chapter>();
for (const c of CHAPTERS) for (const s of c.sections) chapterOfLevel.set(s, c);

/** Der Abschnitt davor im selben Kapitel, oder null beim ersten. */
export function previousSection(levelId: string): string | null {
  const c = chapterOfLevel.get(levelId);
  if (!c) return null;
  const i = c.sections.indexOf(levelId);
  return i > 0 ? c.sections[i - 1] : null;
}
