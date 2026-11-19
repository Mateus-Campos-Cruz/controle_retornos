import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no ambiente do servidor.');
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
pool.on('error', () => console.error('Conexão PostgreSQL indisponível.'));
export async function transaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
