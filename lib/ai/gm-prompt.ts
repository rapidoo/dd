import type { CharacterRow, Universe } from '../db/types';
import { weaponAttack } from '../rules/weapon-attack';
import type { CombatState, Participant } from '../server/combat-loop';
import type { InventoryItem } from '../server/inventory-actions';
import type { ChatMessage } from './llm/types';
import { getGmPrompt } from './universe';

export function buildGmSystemPrompt(
  player: CharacterRow | null,
  companions: CharacterRow[],
  worldSummary?: string | null,
  rollingSummary?: string | null,
  knownEntities?: Array<{ name: string; kind: string; short_description: string | null }>,
  universe?: Universe,
  combatState?: CombatState | null,
): string {
  const effectiveUniverse = universe ?? 'dnd5e';
  const partyLines: string[] = [];
  if (player) {
    partyLines.push(
      `- Le joueur incarne ${player.name} (id="${player.id}", ${player.species} · ${player.class} niv. ${player.level}). PV ${player.current_hp}/${player.max_hp}, CA ${player.ac}.`,
    );
    const weaponLines = describeWeapons(player);
    if (weaponLines.length > 0) {
      partyLines.push(`  · Armes : ${weaponLines.join(' ; ')}`);
    }
  }
  if (companions.length > 0) {
    partyLines.push(
      "- Compagnons IA autour du feu (utilise l'outil prompt_companion pour leur donner la parole) :",
    );
    for (const c of companions) {
      const persona =
        typeof c.persona === 'object' && c.persona && 'notes' in c.persona
          ? String((c.persona as { notes?: unknown }).notes ?? '')
          : '';
      partyLines.push(
        `  · id="${c.id}" — ${c.name} (${c.species} ${c.class} niv. ${c.level})${persona ? ` — ${persona}` : ''}`,
      );
    }
  } else {
    partyLines.push(
      "- Le joueur n'a pas encore de compagnon IA. Si la situation s'y prête, tu peux évoquer qu'il est seul, mais NE propose PAS d'en introduire : c'est le joueur qui en recrute via la page Équipe.",
    );
  }

  const worldBlock = worldSummary
    ? `\nCampagne en cours :\n${clipText(worldSummary.trim(), 3000)}\n`
    : '';
  const rollingBlock = rollingSummary
    ? `\nJusqu'ici dans cette veillée (résumé, les faits sont canon) :\n${clipText(rollingSummary.trim(), 3000)}\n`
    : '';
  const memoryBlock = buildMemoryBlock(knownEntities ?? []);
  const combatBlock = renderCombatBlock(combatState ?? null);
  const basePrompt = getGmPrompt(effectiveUniverse);

  return `${basePrompt}
${worldBlock}${rollingBlock}${memoryBlock}${combatBlock}
Équipe actuelle :
${partyLines.join('\n')}

Quand un compagnon est présent, pense à lui laisser la parole régulièrement via prompt_companion — décris une scène, puis passe-lui le micro (indique character_id et éventuellement un hint).`;
}

const ENTITY_KIND_LABEL: Record<string, string> = {
  npc: 'PNJ',
  location: 'Lieu',
  faction: 'Faction',
  item: 'Objet',
  quest: 'Quête',
  event: 'Événement',
};

function buildMemoryBlock(
  entities: Array<{ name: string; kind: string; short_description: string | null }>,
): string {
  if (entities.length === 0) return '';
  const lines = entities.slice(0, 6).map((e) => {
    const kindLabel = ENTITY_KIND_LABEL[e.kind] ?? e.kind;
    const desc = e.short_description ? ` — ${e.short_description.slice(0, 100)}` : '';
    return `  · [${kindLabel}] ${e.name}${desc}`;
  });
  return `\nMémoire (sois cohérent) :\n${lines.join('\n')}\n`;
}

const PARTICIPANT_KIND_LABEL: Record<Participant['kind'], string> = {
  pc: 'PJ',
  companion: 'compagnon',
  npc: 'PNJ',
};

export function renderCombatBlock(state: CombatState | null): string {
  if (!state || state.endedAt) return '';
  const ps = state.participants;
  if (ps.length === 0) return '';
  const current = ps.find((p) => p.isCurrent);
  const lines = ps.map((p, idx) => {
    const cursor = p.isCurrent ? '▶' : ' ';
    const kind = PARTICIPANT_KIND_LABEL[p.kind];
    const hp = p.currentHP <= 0 ? `0/${p.maxHP} — abattu` : `${p.currentHP}/${p.maxHP} PV`;
    const conds =
      p.conditions && p.conditions.length > 0
        ? ` [${p.conditions.map((x) => x.type).join(', ')}]`
        : '';
    return `  ${cursor} ${idx + 1}. ${p.name} (${kind}, ${hp}, CA ${p.ac})${conds} — id="${p.id}"`;
  });
  const header = current
    ? `Combat actif — round ${state.round}, tour de ${current.name} (${PARTICIPANT_KIND_LABEL[current.kind]}).`
    : `Combat actif — round ${state.round}.`;
  return `\n${header}\nInitiative :\n${lines.join('\n')}\n`;
}

function describeWeapons(character: CharacterRow): string[] {
  const items = (character.inventory as InventoryItem[] | null) ?? [];
  const weapons = items.filter((i) => i.type === 'weapon' && i.weapon?.damageDice);
  const result: string[] = [];
  for (const w of weapons) {
    const attack = weaponAttack(character, w.weapon ?? null);
    if (!attack) continue;
    const type = attack.damageType ? ` ${attack.damageType}` : '';
    result.push(`${w.name} (att ${attack.toHit} · dmg ${attack.damage}${type})`);
  }
  return result;
}

export function clipText(text: string, max: number): string {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function contentLength(msg: ChatMessage): number {
  if (msg.role === 'tool') {
    return msg.results.reduce((n, r) => n + (r.content?.length ?? 0), 0);
  }
  return msg.content.length;
}

const ROLL_DELEGATION_PATTERNS: RegExp[] = [
  /\bfais(?:-moi|[- ]le)?\b[^.!?\n]*\bjet\b/i,
  /\bfaire\b[^.!?\n]*\bjet\b/i,
  /\blance(?:-moi|r|s)?\b[^.!?\n]*(\bd\d+\b|\bdé[s]?\b|\bdés\b)/i,
  /\bjette(?:-moi|r|s)?\b[^.!?\n]*(\bd\d+\b|\bdés?\b)/i,
  /\broule(?:-moi|r|s)?\b[^.!?\n]*(\bdégâts?\b|\bd\d+\b|\bdés?\b)/i,
  /\bjet\s+de\s+(force|dextérité|dexterite|constitution|intelligence|sagesse|charisme|perception|investigation|discrétion|discretion|persuasion|tromperie|intimidation|athlétisme|athletisme|acrobatie|arcanes|religion|nature|survie|médecine|medecine|représentation|representation)\b/i,
  /\bsauvegarde\s+de\s+(for|dex|con|int|sag|cha)\b/i,
  /(^|\s)(à|a)\s+toi\s+de\s+(lancer|jeter)\b/i,
];

export function hasRollDelegation(text: string): boolean {
  if (!text || text.length < 5) return false;
  return ROLL_DELEGATION_PATTERNS.some((re) => re.test(text));
}
