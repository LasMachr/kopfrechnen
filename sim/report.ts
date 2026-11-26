import { HABITS, PROFILES, run, type RunStats } from './simulate';
import { LEVELS, itemByKey } from '../src/lib/tasks';

const DAYS = Number(process.argv[2] ?? 56);
const SEEDS = Number(process.argv[3] ?? 3);
const only = process.argv[4];

const med = (xs: number[]) => { if (!xs.length) return NaN; const s=[...xs].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
const avg = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : NaN;
const f1 = (x: number) => Number.isNaN(x) ? '–' : x.toFixed(1);

const all: RunStats[] = [];
for (const p of PROFILES) for (const h of HABITS) {
  if (only && !`${p.name}/${h.name}`.includes(only)) continue;
  for (let s = 1; s <= SEEDS; s++) all.push(run(p, h, DAYS, s * 1000 + p.name.length * 17 + h.name.length));
}

const order = ['1.1','1.A','1.2','1.3','1.4','1.B','1.C','1.5','3.1','2.1'];
console.log(`\n== Freischalten (U) / Meistern (M): Median-Tag über ${SEEDS} Seeds, ${DAYS} Tage ==`);
console.log('profil/gewohnheit'.padEnd(30) + order.map(o=>o.padStart(9)).join(''));
const groups = new Map<string, RunStats[]>();
for (const r of all) { const k=`${r.profile}/${r.habit}`; groups.set(k,[...(groups.get(k)??[]),r]); }
for (const [k, rs] of groups) {
  const cells = order.map(id => {
    const u = rs.map(r=>r.unlockDay[id]).filter(x=>x!==undefined);
    const m = rs.map(r=>r.masterDay[id]).filter(x=>x!==undefined);
    const us = u.length===rs.length ? String(med(u)) : u.length ? `${med(u)}*` : '-';
    const ms = m.length===rs.length ? String(med(m)) : m.length ? `${med(m)}*` : '-';
    return `${us}/${ms}`.padStart(9);
  });
  console.log(k.padEnd(30) + cells.join(''));
}

console.log('\n== Runden: Aufgaben, Quote erste Abfragen, fällig zu Beginn, Neue, Quellen ==');
for (const [k, rs] of groups) {
  const rounds = rs.flatMap(r=>r.rounds);
  const src: Record<string, number> = {};
  for (const r of rounds) for (const [s,n] of Object.entries(r.bySource)) src[s]=(src[s]??0)+n;
  const tot = Object.values(src).reduce((a,b)=>a+b,0);
  const srcTxt = Object.entries(src).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`${s} ${Math.round(100*n/tot)}%`).join(', ');
  const blocked = rounds.filter(r=>r.blockedNew).length;
  console.log(`${k.padEnd(30)} Aufg ${f1(avg(rounds.map(r=>r.tasks)))}  Quote ${Math.round(100*avg(rounds.filter(r=>r.firstTasks).map(r=>r.firstCorrect/r.firstTasks)))}%  fällig ${f1(avg(rounds.map(r=>r.dueAtStart)))} (max ${Math.max(...rounds.map(r=>r.dueAtStart))})  neu ${f1(avg(rounds.map(r=>r.newIntro)))}  neu-gesperrt ${blocked}/${rounds.length}  Rest-fällig ${f1(avg(rounds.map(r=>r.dueLeftAtEnd)))}`);
  console.log(`${''.padEnd(30)} ${srcTxt}`);
}

console.log('\n== Hänger: eingeführte vs. nie eingeführte Items in freigeschalteten / gemeisterten Leveln (Ende) ==');
for (const [k, rs] of groups) {
  const r = rs[0];
  const parts: string[] = [];
  for (const l of LEVELS) {
    const ls = r.final.levels.get(l.id)!;
    if (!ls.unlocked) continue;
    const intro = l.items.filter(it => r.final.items.get(it.key)!.box > 0).length;
    const strong = l.items.filter(it => r.final.items.get(it.key)!.box >= 4).length;
    const acc = ls.window.length ? Math.round(100*ls.window.filter(w=>w.correct).length/ls.window.length) : -1;
    parts.push(`${l.id}${ls.mastered?'✓':''} ${intro}/${l.items.length}${l.items[0].type==='fact'?` b4:${strong}`:''} q${acc}`);
  }
  console.log(`${k.padEnd(30)} ${parts.join(' | ')}`);
}

console.log('\n== Gemeistert, obwohl Fakten nie eingeführt (Box 0) ==');
for (const r of all) for (const l of LEVELS) {
  const ls = r.final.levels.get(l.id)!;
  if (!ls.everMastered) continue;
  const zero = l.items.filter(it => r.final.items.get(it.key)!.box === 0);
  if (zero.length) console.log(`${r.profile}/${r.habit}/s${r.seed} ${l.id}: ${zero.length} nie eingeführt, z. B. ${zero.slice(0,6).map(it=>it.label).join(' ')}`);
}

console.log('\n== Schwache Fakten (luecken-7x8): Abfragen gesamt / erste, Tag Fach 4, Wissen am Ende ==');
for (const r of all.filter(r=>r.profile==='luecken-7x8')) {
  const txt = Object.entries(r.weakLog).map(([k,w]) => `${k.slice(4)} ${w.asked}/${w.firstAsked} b4:${w.box4Day ?? '-'} p${Math.round(100*r.learner.pCorrect(k,'1.1', r.attempts.at(-1)!.ts))}`).join('  ');
  // Vergleich: Durchschnitt aller 1.1-Fakten
  const counts = new Map<string, number>();
  for (const a of r.attempts) if (a.kind==='round' && a.levelId==='1.1') counts.set(a.itemKey,(counts.get(a.itemKey)??0)+1);
  console.log(`${r.habit}/s${r.seed}: ${txt}   | Ø 1.1-Fakt ${f1(avg([...counts.values()]))}`);
}

console.log('\n== Gemeistert verloren (Rückfälle) ==');
for (const [k, rs] of groups) {
  const lost: Record<string, number> = {};
  for (const r of rs) for (const [l,n] of Object.entries(r.lostMastery)) lost[l]=(lost[l]??0)+n;
  if (Object.keys(lost).length) console.log(`${k}: ${JSON.stringify(lost)}`);
}

console.log('\n== Fehler / Invarianten ==');
for (const r of all) {
  if (r.errors.length) console.log(`${r.profile}/${r.habit}/s${r.seed} FEHLER: ${[...new Set(r.errors)].slice(0,3).join(' ; ')}`);
  if (r.invariantErrors.length) console.log(`${r.profile}/${r.habit}/s${r.seed} INVARIANTE (${r.invariantErrors.length}): ${r.invariantErrors[0]}`);
}

console.log('\n== Einstufung ==');
for (const [k, rs] of groups) {
  const r = rs[0];
  console.log(`${k.padEnd(30)} geöffnet: ${r.placement.unlocked.join(',') || '–'}  Startfächer: ${Object.keys(r.placement.seeds).length}  baseline ${Math.round(r.placement.baselineMs)}`);
}

console.log('\n== Gesamt je Profil: 1.1 gemeistert (Anteil Läufe, Median-Tag), Ø gemeisterte Level am Ende, Ø neu-gesperrte Runden ==');
const byProfile = new Map<string, RunStats[]>();
for (const r of all) byProfile.set(r.profile, [...(byProfile.get(r.profile) ?? []), r]);
for (const [p, rs] of byProfile) {
  const m11 = rs.filter(r => r.masterDay['1.1'] !== undefined);
  const lv = avg(rs.map(r => [...r.final.levels.values()].filter(l => l.everMastered).length));
  const blocked = avg(rs.map(r => r.rounds.filter(x => x.blockedNew).length / Math.max(1, r.rounds.length)));
  console.log(`${p.padEnd(16)} 1.1: ${Math.round(100*m11.length/rs.length)}% (Tag ${med(m11.map(r=>r.masterDay['1.1']))})  Level gemeistert Ø ${f1(lv)}  neu gesperrt ${Math.round(100*blocked)}%`);
}
