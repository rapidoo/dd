import { describe, expect, it } from 'vitest';
import { hasRollDelegation } from '../../lib/ai/gm-agent';

describe('hasRollDelegation', () => {
  it('catches "Fais un jet d\'Intelligence (Investigation)"', () => {
    expect(
      hasRollDelegation("Fais un jet d'Intelligence (Investigation) — tu vas examiner la salle."),
    ).toBe(true);
  });

  it('catches "Fais un jet de Charisme"', () => {
    expect(hasRollDelegation('Fais un jet de Charisme — le sang parle.')).toBe(true);
  });

  it('catches "Fais-moi un jet de Perception"', () => {
    expect(hasRollDelegation('Fais-moi un jet de Perception, vite.')).toBe(true);
  });

  it('catches "Lance un d20"', () => {
    expect(hasRollDelegation('Lance un d20 pour voir si tu réussis.')).toBe(true);
  });

  it('catches "Jette les dés"', () => {
    expect(hasRollDelegation('Jette les dés avant de continuer.')).toBe(true);
  });

  it('catches "Roule les dégâts"', () => {
    expect(hasRollDelegation('Roule les dégâts de ton épée.')).toBe(true);
  });

  it('catches "À toi de lancer"', () => {
    expect(hasRollDelegation('À toi de lancer maintenant.')).toBe(true);
  });

  it('catches a bare "jet de Sagesse (Perception)"', () => {
    expect(hasRollDelegation('Un jet de Sagesse (Perception) est requis ici.')).toBe(true);
  });

  it('catches "sauvegarde de Dex"', () => {
    expect(hasRollDelegation('Sauvegarde de Dex DD 15.')).toBe(true);
  });

  it('does not false-positive on ordinary narration', () => {
    expect(hasRollDelegation('Le forgeron te regarde en silence. Que fais-tu ?')).toBe(false);
  });

  it('does not false-positive on "un jet de lumière"', () => {
    // "jet de lumière" is a light beam, not a game roll
    expect(hasRollDelegation('Un jet de lumière traverse la vitre.')).toBe(false);
  });

  it('does not false-positive on empty text', () => {
    expect(hasRollDelegation('')).toBe(false);
  });

  it('does not false-positive on tool-only turns', () => {
    expect(hasRollDelegation('Les runes commencent à rougeoyer.')).toBe(false);
  });
});
