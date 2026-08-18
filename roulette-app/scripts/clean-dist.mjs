import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, '..');
const publicDirectory = path.resolve(appDirectory, '..', 'public');
const outputDirectory = path.resolve(publicDirectory, 'roulette');

if (path.dirname(outputDirectory) !== publicDirectory || path.basename(outputDirectory) !== 'roulette') {
  throw new Error(`Refusing to clean an unexpected output path: ${outputDirectory}`);
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
