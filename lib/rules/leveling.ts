/**
 * Experience thresholds to reach each level (SRD 5.1 / dnd5e_rules.md).
 * Index = level (1..20); value = XP required to BE at that level.
 */
const XP_TABLE: readonly number[] = [
  0, // L1
  300,
  900,
  2700,
  6500,
  14000,
  23000,
  34000,
  48000,
  64000,
  85000,
  100000,
  120000,
  140000,
  165000,
  195000,
  225000,
  265000,
  305000,
  355000, // L20
];

export function levelFromXP(xp: number): number {
  if (xp < 0) throw new Error(`XP cannot be negative: ${xp}`);
  let level = 1;
  for (let i = 0; i < XP_TABLE.length; i++) {
    const threshold = XP_TABLE[i];
    if (threshold === undefined) break;
    if (xp >= threshold) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

export function xpToReach(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new Error(`Level out of range [1,20]: ${level}`);
  }
  const v = XP_TABLE[level - 1];
  if (v === undefined) throw new Error('Level lookup failed');
  return v;
}

/** Levels that grant an Ability Score Improvement / feat (standard classes). */
export const ASI_LEVELS: readonly number[] = [4, 8, 12, 16, 19];

export function grantsASI(level: number): boolean {
  return ASI_LEVELS.includes(level);
}
