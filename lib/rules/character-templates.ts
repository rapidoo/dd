import type { Universe } from '../db/types';
import { type DndCharacterTemplate, getDndTemplateById, getDndTemplates } from './dnd5e-templates';
import {
  getNaheulbeukTemplateById,
  getNaheulbeukTemplates,
  type NaheulbeukCharacterTemplate,
} from './naheulbeuk-templates';
import {
  getWitcherTemplateById,
  getWitcherTemplates,
  type WitcherCharacterTemplate,
} from './witcher-templates';

/**
 * Universe-agnostic accessor for character templates. Each universe keeps its
 * own template module (with universe-specific extras like Witcher signs or
 * Naheulbeuk juron); this thin layer just routes to the right one. Both
 * player creation and companion recruitment consume from here.
 */

export type CharacterTemplate =
  | DndCharacterTemplate
  | NaheulbeukCharacterTemplate
  | WitcherCharacterTemplate;

export function getTemplatesForUniverse(universe: Universe): CharacterTemplate[] {
  switch (universe) {
    case 'witcher':
      return getWitcherTemplates();
    case 'naheulbeuk':
      return getNaheulbeukTemplates();
    case 'dnd5e':
      return getDndTemplates();
  }
}

export function getTemplateById(universe: Universe, id: string): CharacterTemplate | undefined {
  switch (universe) {
    case 'witcher':
      return getWitcherTemplateById(id);
    case 'naheulbeuk':
      return getNaheulbeukTemplateById(id);
    case 'dnd5e':
      return getDndTemplateById(id);
  }
}

/** Section heading + intro shown above the template grid in the UI. */
export function getTemplatesIntro(universe: Universe): { title: string; subtitle: string } {
  switch (universe) {
    case 'witcher':
      return {
        title: '✧ Modèles de personnages',
        subtitle:
          'Choisis un personnage canonique du Continent. Tu hérites de ses stats, de ses signes et de son inventaire de sorceleur.',
      };
    case 'naheulbeuk':
      return {
        title: "🍺 La Compagnie d'Aventuriers",
        subtitle:
          'Pioche un membre canonique de la Compagnie. Tu hérites de ses stats, son tic de langage et son juron favori.',
      };
    case 'dnd5e':
      return {
        title: '✦ Archétypes classiques',
        subtitle:
          'Pioche un archétype SRD prêt à jouer. Tu hérites de ses stats et de ses compétences principales.',
      };
  }
}
