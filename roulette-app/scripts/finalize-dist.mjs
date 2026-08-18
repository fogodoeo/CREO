import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, '..', '..', 'public', 'roulette');
const outputFile = path.resolve(outputDirectory, 'index.html');

if (path.dirname(outputFile) !== outputDirectory || !fs.existsSync(outputFile)) {
  throw new Error(`Roulette build output is missing: ${outputFile}`);
}

const source = fs.readFileSync(outputFile, 'utf8');
fs.writeFileSync(outputFile, `${source.replace(/[ \t]+$/gm, '').trimEnd()}\n`, 'utf8');
