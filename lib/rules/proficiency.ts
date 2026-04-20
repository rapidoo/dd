/**
 * Proficiency bonus by level (dnd5e_rules.md):
 *   Levels 1–4 : +2
 *   Levels 5–8 : +3
 *   Levels 9–12: +4
 *   Levels 13–16: +5
 *   Levels 17–20: +6
 * Formula: 2 + floor((level - 1) / 4)
 */
export function proficiencyBonus(level: number): number {
  if (!Number.isInteger(level)) {
    throw new Error(`Level must be an integer, got ${level}`);
  }
  if (level < 1 || level > 20) {
    throw new Error(`Level out of range [1,20]: ${level}`);
  }
  return 2 + Math.floor((level - 1) / 4);
}
