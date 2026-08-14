import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const node = process.execPath;
const environment = existsSync('.env') ? ['--env-file=.env'] : [];
const backend = spawn(node, [...environment, '--import', 'tsx', 'src/server/index.ts'], {
  stdio: 'inherit',
});
const frontend = spawn(node, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
  process.exitCode = code;
};

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

backend.on('exit', (code) => {
  if (!stopping) {
    console.error(`Backend stopped unexpectedly${code === null ? '' : ` (exit ${code})`}.`);
    stop(code ?? 1);
  }
});

frontend.on('exit', (code) => {
  if (!stopping) {
    console.error(`Frontend stopped unexpectedly${code === null ? '' : ` (exit ${code})`}.`);
    stop(code ?? 1);
  }
});
