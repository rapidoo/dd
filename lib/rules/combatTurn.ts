/**
 * Turn economy per dnd5e_rules.md §7.3 / §13:
 *   Per turn:   1 action, 1 bonus action (if any), movement (speed), free interaction.
 *   Per round:  1 reaction (not refreshed until next round).
 *   Movement can be split before/after actions.
 */

export interface TurnBudget {
  actionUsed: boolean;
  bonusActionUsed: boolean;
  reactionUsed: boolean;
  movementRemaining: number;
  speed: number;
}

export function startTurn(speed: number, _reactionUsedLastRound: boolean): TurnBudget {
  // Reactions refresh at the start of your own turn, so a new turn always starts
  // with the reaction available regardless of whether one was used last round.
  return {
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    movementRemaining: speed,
    speed,
  };
}

export type TurnActionKind = 'action' | 'bonus' | 'reaction';

export interface ActionOutcome {
  ok: boolean;
  reason?: string;
  budget: TurnBudget;
}

export function takeAction(budget: TurnBudget, kind: TurnActionKind): ActionOutcome {
  switch (kind) {
    case 'action':
      if (budget.actionUsed) return { ok: false, reason: 'Action already used this turn', budget };
      return { ok: true, budget: { ...budget, actionUsed: true } };
    case 'bonus':
      if (budget.bonusActionUsed)
        return { ok: false, reason: 'Bonus action already used this turn', budget };
      return { ok: true, budget: { ...budget, bonusActionUsed: true } };
    case 'reaction':
      if (budget.reactionUsed)
        return { ok: false, reason: 'Reaction already used this round', budget };
      return { ok: true, budget: { ...budget, reactionUsed: true } };
  }
}

export function spendMovement(budget: TurnBudget, distance: number): ActionOutcome {
  if (distance < 0) return { ok: false, reason: 'Negative movement', budget };
  if (distance > budget.movementRemaining) {
    return {
      ok: false,
      reason: `Only ${budget.movementRemaining} remaining, asked ${distance}`,
      budget,
    };
  }
  return {
    ok: true,
    budget: { ...budget, movementRemaining: budget.movementRemaining - distance },
  };
}

export interface RoundState {
  round: number;
  currentIndex: number;
  orderLength: number;
}

export function advanceTurn(state: RoundState): RoundState {
  const next = state.currentIndex + 1;
  if (next >= state.orderLength) {
    return { ...state, currentIndex: 0, round: state.round + 1 };
  }
  return { ...state, currentIndex: next };
}
