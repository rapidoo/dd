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
  'CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT session_id_unique IF NOT EXISTS FOR (n:Session) REQUIRE n.id IS UNIQUE',
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
      'MATCH (n:Entity) RETURN n.campaign_id AS campaign_id, count(n) AS total ORDER BY total DESC',
    );
    if (counts.records.length === 0) {
      console.log('\n📭 Aucune entité en base. Joue un tour de session pour les déclencher.');
    } else {
      console.log('\n📊 Entités par campagne :');
      for (const r of counts.records) {
        console.log(`   ${r.get('campaign_id') ?? '(null)'}: ${r.get('total')}`);
      }
    }

    const total = await session.run('MATCH (n:Entity) RETURN count(n) AS total');
    const totalCount = total.records[0]?.get('total') ?? 0;
    console.log(`\nTotal : ${totalCount} Entity nodes.`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('❌ Neo4j setup failed:', err.message ?? err);
  process.exit(1);
});
