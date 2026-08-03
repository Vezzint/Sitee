import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

// Disable prefetch as it can cause issues in some environments
const client = postgres(databaseUrl, { prepare: false });

export const db = drizzle(client, { schema });
