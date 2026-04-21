/**
 * Hand-written Supabase DB types mirroring supabase/migrations/*.sql.
 * Regenerate via `supabase gen types typescript` once CLI access is set up.
 */

export type Uuid = string;
export type Iso = string;

export type AuthorKind = 'user' | 'gm' | 'character' | 'system';
export type RollKind =
  | 'attack'
  | 'damage'
  | 'save'
  | 'check'
  | 'initiative'
  | 'death_save'
  | 'concentration'
  | 'hit_die';
export type SettingMode = 'homebrew' | 'module' | 'generated';
export type CampaignStatus = 'active' | 'paused' | 'archived';
export type EntityKind = 'npc' | 'location' | 'faction' | 'item' | 'quest' | 'event';
export type AssetKind = 'scene' | 'portrait' | 'map' | 'item';
export type CombatStatus = 'active' | 'ended';
export type AdvantageValue = 'normal' | 'advantage' | 'disadvantage';

export type ProfileRow = {
  id: Uuid;
  display_name: string;
  avatar_url: string | null;
  created_at: Iso;
  updated_at: Iso;
};

export type CampaignRow = {
  id: Uuid;
  owner_id: Uuid;
  name: string;
  setting_mode: SettingMode;
  setting_pitch: string | null;
  module_id: string | null;
  world_summary: string | null;
  current_session_id: Uuid | null;
  status: CampaignStatus;
  created_at: Iso;
  updated_at: Iso;
};

export type CharacterRow = {
  id: Uuid;
  campaign_id: Uuid;
  owner_id: Uuid | null;
  is_ai: boolean;
  name: string;
  species: string;
  class: string;
  subclass: string | null;
  background: string | null;
  alignment: string | null;
  level: number;
  str: number;
  dex: number;
  con: number;
  int_score: number;
  wis: number;
  cha: number;
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  ac: number;
  speed: number;
  proficiencies: Record<string, unknown>;
  features: unknown[];
  inventory: unknown[];
  spells_known: unknown[];
  spell_slots: Record<string, { max: number; used: number }>;
  conditions: Array<{ type: string; durationRounds?: number; source?: string }>;
  death_saves: {
    successes: number;
    failures: number;
    stable: boolean;
    dead: boolean;
  };
  concentration: { active: boolean; spellName: string | null; level: number | null };
  exhaustion: number;
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  persona: Record<string, unknown> | null;
  portrait_url: string | null;
  created_at: Iso;
  updated_at: Iso;
};

export type SessionRow = {
  id: Uuid;
  campaign_id: Uuid;
  session_number: number;
  title: string | null;
  summary: string | null;
  started_at: Iso;
  ended_at: Iso | null;
};

export type MessageRow = {
  id: Uuid;
  session_id: Uuid;
  author_kind: AuthorKind;
  author_id: Uuid | null;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Iso;
};

export type DiceRollRow = {
  id: Uuid;
  session_id: Uuid;
  character_id: Uuid | null;
  roll_kind: RollKind;
  expression: string;
  raw_dice: number[];
  modifier: number;
  total: number;
  advantage: AdvantageValue;
  dc: number | null;
  target_ac: number | null;
  outcome: string | null;
  context: Record<string, unknown>;
  created_at: Iso;
};

export type CombatEncounterRow = {
  id: Uuid;
  session_id: Uuid;
  status: CombatStatus;
  round: number;
  current_turn_index: number;
  initiative_order: Array<{ id: string; total: number; dexMod: number }>;
  combatants: unknown[];
  started_at: Iso;
  ended_at: Iso | null;
};

export type EntityRow = {
  id: Uuid;
  campaign_id: Uuid;
  kind: EntityKind;
  name: string;
  short_description: string | null;
  neo4j_node_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Iso;
  updated_at: Iso;
};

export type GeneratedAssetRow = {
  id: Uuid;
  campaign_id: Uuid;
  kind: AssetKind;
  prompt: string;
  storage_path: string;
  entity_id: Uuid | null;
  created_at: Iso;
};

type Table<R, I = Partial<R>, U = Partial<R>> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      campaigns: Table<CampaignRow>;
      characters: Table<CharacterRow>;
      sessions: Table<SessionRow>;
      messages: Table<MessageRow>;
      dice_rolls: Table<DiceRollRow>;
      combat_encounters: Table<CombatEncounterRow>;
      entities: Table<EntityRow>;
      generated_assets: Table<GeneratedAssetRow>;
    };
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, never>; Returns: unknown }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
