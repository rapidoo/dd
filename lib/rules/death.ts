import { rollD20 } from './dice';
import type { DeathSaves, Random } from './types';
import { defaultRandom } from './types';

export function emptyDeathSaves(): DeathSaves {
  return { successes: 0, failures: 0, stable: false, dead: false };
}

export interface DeathSaveRollResult {
  state: DeathSaves;
  roll: number;
  naturalOne: boolean;
  naturalTwenty: boolean;
}

/**
 * Roll a death saving throw (dnd5e_rules.md §7.10):
 *   - roll 1d20 with no modifier
 *   - >= 10 → success
 *   - <  10 → failure
 *   - nat 1  → +2 failures
 *   - nat 20 → revive at 1 HP (resets counters, clears dead/stable)
 *   - 3 successes → stable (reset counters, stable=true)
 *   - 3 failures  → dead
 */
export function rollDeathSave(
  state: DeathSaves,
  rng: Random = defaultRandom,
): DeathSaveRollResult & { revived: boolean } {
  if (state.dead) throw new Error('Cannot roll death save on a dead creature');
  if (state.stable) throw new Error('Cannot roll death save on a stable creature');

  const d20 = rollD20(0, 'normal', rng);
  const roll = d20.roll;
  let successes = state.successes;
  let failures = state.failures;
  let stable = false;
  let dead = false;
  let revived = false;

  if (roll === 20) {
    // Nat 20: revive at 1 HP — caller must apply the HP change; we just reset and flag.
    successes = 0;
    failures = 0;
    revived = true;
  } else if (roll === 1) {
    failures += 2;
  } else if (roll >= 10) {
    successes += 1;
  } else {
    failures += 1;
  }

  if (!revived) {
    if (successes >= 3) {
      stable = true;
      successes = 3;
    }
    if (failures >= 3) {
      dead = true;
      failures = 3;
    }
  }

  return {
    state: { successes, failures, stable, dead },
    roll,
    naturalOne: roll === 1,
    naturalTwenty: roll === 20,
    revived,
  };
}

/** A creature that was revived (nat 20 on death save) regains 1 HP. */
export const DEATH_SAVE_REVIVE_HP = 1;
