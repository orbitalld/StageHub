// npm run create-user -- usuario "Nombre completo" rol
import readline from 'node:readline/promises';
import { buildConfig } from '../server/config.js';
import { openConfiguredDb, withDb } from '../server/db.js';
import { createUser } from '../server/users.js';
import { audit } from '../server/audit.js';
const [username,full_name,role]=process.argv.slice(2);
if(!username||!full_name||!role){console.error('Uso: npm run create-user -- <usuario> "<Nombre completo>" <rol>');process.exit(1);}
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const password=await rl.question('Contraseña (mínimo 8 caracteres; se verá en esta terminal): ');rl.close();
let db;
try {db=await openConfiguredDb(buildConfig()); await withDb(db,async()=>{const u=await createUser(db,{username,full_name,role,password});await audit(db,u,'crear','user',u.id,'Usuario creado desde herramienta administrativa'); console.log(`Usuario creado: ${u.username} (${u.role})`);});}
catch(e){console.error('Error:',e.code||e.message);process.exitCode=1;}finally{if(db)await db.close();}
