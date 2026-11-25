// Explicit migration CLI. Never invoked by the application server startup.
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
if(!process.env.BAYE_DATABASE_URL)throw new Error('BAYE_DATABASE_URL is required; migration aborted.');
if(process.env.BAYE_ALLOW_MIGRATIONS!=='true')throw new Error('Set BAYE_ALLOW_MIGRATIONS=true to explicitly authorize schema migrations.');
const pool=new pg.Pool({connectionString:process.env.BAYE_DATABASE_URL,connectionTimeoutMillis:10000,max:1});
try{
 const sql=await readFile(join(here,'migrations','001_missions.sql'),'utf8');
 await pool.query(sql);
 console.log('BAYE migration 001 applied/verified.');
}finally{await pool.end();}
