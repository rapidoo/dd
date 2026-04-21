#!/usr/bin/env node
/**
 * Migration one-shot : raccroche les Entity / Session / Fact nodes qui
 * ont un `campaign_id` property mais PAS de Campaign root node avec les
 * edges HAS_ENTITY / HAS_SESSION / HAS_FACT. Avant le refactor "Campaign
 * root" tout vivait sur les properties ; maintenant les queries partent
 * du Campaign node, donc ces nodes orphelines sont invisibles.
 *
 * Safe : utilise MERGE partout, idempotent.
 */
import { readFileSync } from 'node:fs';
import neo4j from 'neo4j-driver';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const driver = neo4j.driver(
  env.NEO4J_URI,
  neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD),
  { disableLosslessIntegers: true },
);

async function main() {
  const session = driver.session();
  try {
    // 1. Create missing Campaign nodes from any orphan campaign_id
    const { records: orphanCids } = await session.run(
      `MATCH (n) WHERE (n:Entity OR n:Session OR n:Fact) AND n.campaign_id IS NOT NULL
       AND NOT EXISTS { MATCH (:Campaign { id: n.campaign_id }) }
       RETURN DISTINCT n.campaign_id AS cid`,
    );
    if (orphanCids.length === 0) {
      console.log('✅ Aucun orphelin — rien à faire.');
      return;
    }
    console.log(`🔧 ${orphanCids.length} campagne(s) orpheline(s) à raccrocher.\n`);

    for (const r of orphanCids) {
      const cid = r.get('cid');
      console.log(`— Campaign ${cid}`);
      await session.run(
        `MERGE (c:Campaign { id: $cid })
           ON CREATE SET c.created_at = datetime(), c.migrated = true
           ON MATCH SET c.updated_at = datetime()`,
        { cid },
      );
      const e = await session.run(
        `MATCH (c:Campaign { id: $cid }), (n:Entity { campaign_id: $cid })
         MERGE (c)-[:HAS_ENTITY]->(n)
         RETURN count(n) AS n`,
        { cid },
      );
      const s = await session.run(
        `MATCH (c:Campaign { id: $cid }), (n:Session { campaign_id: $cid })
         MERGE (c)-[:HAS_SESSION]->(n)
         RETURN count(n) AS n`,
        { cid },
      );
      const f = await session.run(
        `MATCH (c:Campaign { id: $cid }), (n:Fact { campaign_id: $cid })
         MERGE (c)-[:HAS_FACT]->(n)
         RETURN count(n) AS n`,
        { cid },
      );
      console.log(
        `   ${e.records[0].get('n')} entities · ${s.records[0].get('n')} sessions · ${f.records[0].get('n')} facts raccrochés`,
      );
    }

    console.log('\n✅ Migration terminée. Relance `node scripts/neo4j-setup.mjs` pour vérifier.');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message ?? err);
  process.exit(1);
});
