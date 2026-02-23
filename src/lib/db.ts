
import { Pool } from 'pg';

let pool: Pool;

declare global {
    var postgresPool: Pool | undefined;
}


const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!process.env.DATABASE_URL) {
    console.warn('Warning: DATABASE_URL is missing. Using fallback connection string.');
}

if (process.env.NODE_ENV === 'production') {
    pool = new Pool({
        connectionString: CONNECTION_STRING,
    });
} else {
    // In development, use a global variable to preserve the pool across module reloads
    if (!global.postgresPool) {
        global.postgresPool = new Pool({
            connectionString: CONNECTION_STRING,
        });
    }
    pool = global.postgresPool;
}

export default pool;
