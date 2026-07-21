#!/usr/bin/env node
// Thin wrapper: real script lives under gateway/ so Baileys resolves from gateway/node_modules
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, '..', 'gateway', 'scripts', 'pair-local.mjs');
const child = spawn(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: join(__dirname, '..', 'gateway'),
});
child.on('exit', (code) => process.exit(code ?? 1));
