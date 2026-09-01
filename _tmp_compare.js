const db = require('./lib/db');

(async () => {
  const { rows } = await db.query(`
    SELECT chunk_start, completed_at, shopify_count, unis_count
    FROM backfill_progress
    WHERE status = 'done'
    ORDER BY chunk_start
  `);
  console.log(`${rows.length} completed chunks`);
  let prev = null;
  for (const r of rows) {
    const elapsed = prev ? (new Date(r.completed_at) - new Date(prev)) / 1000 : null;
    console.log(r.chunk_start.toISOString().slice(0,10), 'unis_count=' + r.unis_count, elapsed !== null ? elapsed.toFixed(1) + 's since prior completion' : '');
    prev = r.completed_at;
  }
})().then(() => db.pool.end()).catch(e => { console.error(e); db.pool.end().finally(() => process.exit(1)); });
