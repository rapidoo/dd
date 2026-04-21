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
 * Runs a Cypher statement and closes the session afterwards. Errors are
 * logged in dev (`[neo4j]`) before being re-thrown — silent swallowing
 * has historically hidden empty-graph bugs. Keep queries parameterised —
 * never interpolate input.
 */
export async function withSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try {
    return await fn(session);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[neo4j]', err instanceof Error ? err.message : err);
    }
    throw err;
  } finally {
    await session.close();
  }
}
