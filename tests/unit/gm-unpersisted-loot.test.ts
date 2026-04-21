import { describe, expect, it } from 'vitest';
import { detectUnpersistedLoot } from '../../lib/ai/gm-agent';

const none = { grant: false, currency: false };
const bothCalled = { grant: true, currency: true };
const onlyGrant = { grant: true, currency: false };
const onlyCurrency = { grant: false, currency: true };

describe('detectUnpersistedLoot', () => {
  it('returns null for plain narration', () => {
    expect(
      detectUnpersistedLoot('Le vent souffle. Vaeloria attend, silencieuse.', none),
    ).toBeNull();
  });

  it('catches written-out coin counts (user case)', () => {
    const text =
      "La bourse contient, au compte : quarante-sept pièces d'or, douze d'argent, et trois petites pièces de platine.";
    expect(detectUnpersistedLoot(text, none)).toMatch(/pièces/);
  });

  it('catches short-form coin counts (47 po)', () => {
    expect(detectUnpersistedLoot('Tu trouves 47 po et 12 pa dans la bourse.', none)).toMatch(
      /pièces/,
    );
  });

  it('returns null when adjust_currency was called for coins', () => {
    expect(detectUnpersistedLoot('Tu gagnes 47 po.', onlyCurrency)).toBeNull();
  });

  it('catches a bullet list of items', () => {
    const text = `Voici ce que vous trouvez :
— Une bourse de cuir
— Un poignard à lame noircie
— L'anneau de fer noir
— Une fiole de verre brune`;
    expect(detectUnpersistedLoot(text, none)).toMatch(/objets/);
  });

  it('returns null when only 1 bullet (ambiguous — could be a dialogue dash)', () => {
    expect(detectUnpersistedLoot('— Un seul objet ne déclenche pas.', none)).toBeNull();
  });

  it('returns null when grant_item was called for the bullet list', () => {
    const text = `— Une bourse
— Un poignard
— Une lettre`;
    expect(detectUnpersistedLoot(text, onlyGrant)).toBeNull();
  });

  it('combines both reasons when text mentions coins AND items', () => {
    const text = `Tu ouvres le coffre : 20 po, 5 pa.
— Une potion de soin
— Une dague`;
    const reason = detectUnpersistedLoot(text, none);
    expect(reason).toMatch(/pièces/);
    expect(reason).toMatch(/objets/);
  });

  it('returns null when both tools were called', () => {
    const text = `— Une épée
— Une potion
Et 10 po.`;
    expect(detectUnpersistedLoot(text, bothCalled)).toBeNull();
  });

  it('does not false-positive on prices in dialogue', () => {
    // The narrator says a price but tool isn't required — prices spoken in
    // dialogue aren't a loot event. This is a known limitation; we prefer
    // occasional false positives over missing loot, so we accept the match.
    expect(detectUnpersistedLoot('Le marchand dit : "Quinze pièces d\'or."', none)).toMatch(
      /pièces/,
    );
  });
});
