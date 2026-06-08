// Shared DB client for all Vercel serverless functions.
// IMPORTANT: This file is also referenced by the Express dev server.
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../../shared/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const client = neon(databaseUrl);
export const db = drizzle(client, { schema });
export { schema };
