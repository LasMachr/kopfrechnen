import { describe, expect, it } from 'vitest';
import { add, format, fromDecimal, r, roundTo } from '../src/lib/math/rational';
import { checkAnswer, detectSlip, parseInput } from '../src/lib/math/answer';

describe('Rational', () => {
  it('rechnet exakt', () => {
    expect(add(fromDecimal('0,1')!, fromDecimal('0,2')!)).toEqual(fromDecimal('0,3'));
  });
  it('formatiert deutsch', () => {
    expect(format(r(1225))).toBe('1225');
    expect(format(r(480000))).toBe('480.000');
    expect(format(r(-1))).toBe('−1');
    expect(format(r(3, 8))).toBe('0,375');
    expect(format(r(95, 4))).toBe('23,75');
    expect(format(r(1, 3))).toBe('1/3');
  });
  it('rundet kaufmännisch', () => {
    expect(roundTo(r(100, 3), 1)).toEqual(r(333, 10));
    expect(roundTo(r(-24), 0)).toEqual(r(-24));
    expect(roundTo(r(1200, 38), 0)).toEqual(r(32));
  });
});

describe('Antworten', () => {
  it('0,50 und 0,5 sind gleich', () => {
    expect(checkAnswer('0,50', r(1, 2), 'exact')).toBe(true);
    expect(checkAnswer('0,5', r(1, 2), 'exact')).toBe(true);
  });
  it('Kürzen nur vollständig', () => {
    expect(checkAnswer('3/4', r(3, 4), 'fraction-reduced')).toBe(true);
    expect(checkAnswer('6/8', r(3, 4), 'fraction-reduced')).toBe(false);
    expect(checkAnswer('0,75', r(3, 4), 'fraction-reduced')).toBe(false);
  });
  it('Mit Brüchen rechnen: jede gleichwertige Form', () => {
    expect(checkAnswer('3/6', r(1, 2), 'fraction-any')).toBe(true);
  });
  it('Vorzeichen gehört dazu', () => {
    expect(checkAnswer('-1', r(-1), 'exact')).toBe(true);
    expect(checkAnswer('1', r(-1), 'exact')).toBe(false);
  });
  it('Schätzen: innerhalb 10 %', () => {
    expect(checkAnswer('1000', r(1029), 'estimate')).toBe(true);
    expect(checkAnswer('900', r(1029), 'estimate')).toBe(false);
  });
  it('erkennt typische Fehler', () => {
    expect(detectSlip('2820', r(282))).toBe('Komma prüfen');
    expect(detectSlip('228', r(282))).toBe('Zahlendreher?');
    expect(detectSlip('300', r(282))).toBe(null);
    expect(detectSlip('1', r(10))).toBe(null);
  });
  it('lehnt Unsinn ab', () => {
    expect(parseInput('')).toBe(null);
    expect(parseInput('1/0')).toBe(null);
    expect(parseInput(',')).toBe(null);
  });
});
