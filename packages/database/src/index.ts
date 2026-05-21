import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "./pool.js";
import * as schema from "./schema.js";

export const db = drizzle(pool, { schema });

export { schema };
export * from "./schema.js";
export { pool };
export * from "./queries/index.js";
export * from "drizzle-orm";
