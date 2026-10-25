import fs from 'node:fs/promises';
import { migrateAtStartup } from './startupMigration.js';
import { createSupervisorClient, dockerSourceArchive, extractMigrationArchive } from './migrationTransport.js';

try {
  const options = JSON.parse(await fs.readFile('/data/options.json', 'utf8'));
  await migrateAtStartup({ options, supervisor: createSupervisorClient(options),
    sourceArchive: dockerSourceArchive, extractArchive: extractMigrationArchive });
} catch (error) {
  console.error(`[migration] ERROR: ${error.message}`);
  console.error('[migration] No se han iniciado el navegador ni las tareas. Revisa Configuración > Opciones y vuelve a iniciar.');
  process.exitCode = 1;
}
