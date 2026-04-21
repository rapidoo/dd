import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { env } from '../db/env';

let driver: Driver | null = null;

function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(env.neo4jUri, neo4j.auth.basic(env.neo4jUser, env.neo4jPassword), {
      disableLosslessIntegers: true,
    });
  }
  return driver;
}

/**
 * Runs a Cypher statement against the default Neo4j database and closes the
 * session afterwards. Keep queries parameterised — never interpolate input.
 */
export async function withSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}
