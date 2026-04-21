#!/usr/bin/env node
/**
 * Neo4j setup + health check.
 *   - Pings the server
 *   - Creates the Entity / Session uniqueness constraints + lookup index
 *   - Prints an entity count per campaign so you can confirm data is flowing
 *
 * Run with: node scripts/neo4j-setup.mjs
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

const uri = env.NEO4J_URI;
const user = env.NEO4J_USER;
const password = env.NEO4J_PASSWORD;
if (!uri || !user || !password) {
  console.error('❌ Missing NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD in .env.local');
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
  disableLosslessIntegers: true,
});

const CONSTRAINTS = [
  'CREATE CONSTRAINT campaign_id_unique IF NOT EXISTS FOR (n:Campaign) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT session_id_unique IF NOT EXISTS FOR (n:Session) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT fact_id_unique IF NOT EXISTS FOR (n:Fact) REQUIRE n.id IS UNIQUE',
];
const INDEXES = [
  'CREATE INDEX entity_lookup IF NOT EXISTS FOR (n:Entity) ON (n.campaign_id, n.kind, n.name)',
];

async function main() {
  const session = driver.session();
  try {
    const ping = await session.run('RETURN 1 AS ok');
    if (ping.records[0]?.get('ok') !== 1) throw new Error('unexpected ping response');
    console.log(`✅ Connected to ${uri}`);

    for (const stmt of CONSTRAINTS) {
      await session.run(stmt);
      console.log(`   ✓ ${stmt.split(' FOR ')[0]}`);
    }
    for (const stmt of INDEXES) {
      await session.run(stmt);
      console.log(`   ✓ ${stmt.split(' FOR ')[0]}`);
    }

    const counts = await session.run(
      `MATCH (c:Campaign)
       OPTIONAL MATCH (c)-[:HAS_ENTITY]->(e:Entity)
       WITH c, count(DISTINCT e) AS entities
       OPTIONAL MATCH (c)-[:HAS_SESSION]->(s:Session)
       WITH c, entities, count(DISTINCT s) AS sessions
       OPTIONAL MATCH (c)-[:HAS_FACT]->(f:Fact)
       RETURN c.id AS campaign_id, entities, sessions, count(DISTINCT f) AS facts
       ORDER BY entities DESC`,
    );
    if (counts.records.length === 0) {
      console.log(
        '\n📭 Aucune campagne en base. Joue un tour de session pour déclencher le concierge.',
      );
    } else {
      console.log('\n📊 Par campagne (entités · sessions · faits) :');
      for (const r of counts.records) {
        console.log(
          `   ${r.get('campaign_id')} — ${r.get('entities')} · ${r.get('sessions')} · ${r.get('facts')}`,
        );
      }
    }

    const totals = await session.run(
      `MATCH (n) WHERE n:Campaign OR n:Entity OR n:Session OR n:Fact
       RETURN labels(n)[0] AS label, count(n) AS total
       ORDER BY label`,
    );
    console.log('\nTotaux par type de nœud :');
    for (const r of totals.records) console.log(`   ${r.get('label')}: ${r.get('total')}`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('❌ Neo4j setup failed:', err.message ?? err);
  process.exit(1);
});
