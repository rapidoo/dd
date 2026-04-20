import { describe, expect, it } from 'vitest';
import { advanceTurn, spendMovement, startTurn, takeAction } from '../combatTurn';

describe('startTurn', () => {
  it('initialises a fresh budget', () => {
    const b = startTurn(9, false);
    expect(b.actionUsed).toBe(false);
    expect(b.bonusActionUsed).toBe(false);
    expect(b.reactionUsed).toBe(false);
    expect(b.movementRemaining).toBe(9);
    expect(b.speed).toBe(9);
  });
});

describe('takeAction', () => {
  it('uses action once', () => {
    let b = startTurn(9, false);
    let r = takeAction(b, 'action');
    expect(r.ok).toBe(true);
    b = r.budget;
    r = takeAction(b, 'action');
    expect(r.ok).toBe(false);
  });

  it('bonus is independent of action', () => {
    const b = startTurn(9, false);
    const r = takeAction(b, 'bonus');
    expect(r.ok).toBe(true);
    expect(r.budget.actionUsed).toBe(false);
  });

  it('reaction once per round', () => {
    let b = startTurn(9, false);
    const r1 = takeAction(b, 'reaction');
    expect(r1.ok).toBe(true);
    b = r1.budget;
    const r2 = takeAction(b, 'reaction');
    expect(r2.ok).toBe(false);
  });
});

describe('spendMovement', () => {
  it('deducts from remaining', () => {
    const b = startTurn(9, false);
    const r = spendMovement(b, 6);
    expect(r.ok).toBe(true);
    expect(r.budget.movementRemaining).toBe(3);
  });

  it('refuses over-move', () => {
    const b = startTurn(9, false);
    const r = spendMovement(b, 15);
    expect(r.ok).toBe(false);
  });

  it('refuses negative distance', () => {
    const b = startTurn(9, false);
    const r = spendMovement(b, -3);
    expect(r.ok).toBe(false);
  });
});

describe('advanceTurn', () => {
  it('moves to next combatant', () => {
    const s = advanceTurn({ round: 1, currentIndex: 0, orderLength: 3 });
    expect(s.currentIndex).toBe(1);
    expect(s.round).toBe(1);
  });

  it('wraps and increments round', () => {
    const s = advanceTurn({ round: 1, currentIndex: 2, orderLength: 3 });
    expect(s.currentIndex).toBe(0);
    expect(s.round).toBe(2);
  });
});
