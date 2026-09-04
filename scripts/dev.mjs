import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const node = process.execPath;
const environment = existsSync('.env') ? ['--env-file=.env'] : [];
const nodeOsUserInfoFallback = path.resolve('scripts/node-os-userinfo-fallback.cjs');
const logPath = path.resolve('.local-dev.log');
const stableBackendMs = 30_000;
const maximumConsecutiveBackendFailures = 5;

try {
  if (existsSync(logPath) && statSync(logPath).size > 2_000_000) {
    const recentLog = readFileSync(logPath, 'utf8').slice(-500_000);
    writeFileSync(logPath, recentLog, 'utf8');
  }
} catch {
  // Logging must never prevent local development from starting.
}

const writeLog = (message) => {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(entry);
  try { appendFileSync(logPath, entry, 'utf8'); } catch { /* keep running without a file log */ }
};

const pipeOutput = (stream, destination, prefix) => {
  stream?.on('data', (chunk) => {
    destination.write(chunk);
    try { appendFileSync(logPath, `[${prefix}] ${chunk.toString()}`, 'utf8'); } catch { /* keep running */ }
  });
};

let backend;
let frontend;
let backendRestartTimer;
let backendStableTimer;
let consecutiveBackendFailures = 0;
let stopping = false;

const stopChild = (child) => {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
};

const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  if (backendRestartTimer) clearTimeout(backendRestartTimer);
  if (backendStableTimer) clearTimeout(backendStableTimer);
  stopChild(backend);
  stopChild(frontend);
  process.exitCode = code;
};

const startBackend = () => {
  if (stopping) return;
  const startedAt = Date.now();
  backend = spawn(node, [...environment, '--require', nodeOsUserInfoFallback, '--import', 'tsx', 'src/server/index.ts'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, DASHBOARD_SERVE_STATIC: 'false', AI_REPORT_SOURCE_URL: process.env.AI_REPORT_SOURCE_URL || 'http://192.168.1.50:3100' },
  });
  writeLog(`Backend started (PID ${backend.pid}).`);
  pipeOutput(backend.stdout, process.stdout, 'backend');
  pipeOutput(backend.stderr, process.stderr, 'backend:error');
  backendStableTimer = setTimeout(() => {
    consecutiveBackendFailures = 0;
    writeLog(`Backend PID ${backend?.pid ?? 'unknown'} has been stable for ${stableBackendMs / 1000} seconds.`);
  }, stableBackendMs);
  backend.once('error', (error) => writeLog(`Backend process error: ${error.message}`));
  backend.once('exit', (code, signal) => {
    if (backendStableTimer) clearTimeout(backendStableTimer);
    if (stopping) return;
    const uptimeMs = Date.now() - startedAt;
    if (uptimeMs >= stableBackendMs) consecutiveBackendFailures = 0;
    consecutiveBackendFailures += 1;
    writeLog(`Backend stopped unexpectedly after ${uptimeMs} ms${code === null ? '' : ` (exit ${code})`}${signal ? ` (signal ${signal})` : ''}.`);
    if (consecutiveBackendFailures > maximumConsecutiveBackendFailures) {
      writeLog('Backend failed repeatedly during startup; stopping the dev stack so the configuration error remains visible.');
      stop(code ?? 1);
      return;
    }
    const delayMs = Math.min(500 * (2 ** (consecutiveBackendFailures - 1)), 8_000);
    writeLog(`Restarting backend in ${delayMs} ms (attempt ${consecutiveBackendFailures}/${maximumConsecutiveBackendFailures}).`);
    backendRestartTimer = setTimeout(startBackend, delayMs);
  });
};

startBackend();
frontend = spawn(node, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'pipe'],
});
writeLog(`Frontend started (PID ${frontend.pid}).`);
pipeOutput(frontend.stdout, process.stdout, 'frontend');
pipeOutput(frontend.stderr, process.stderr, 'frontend:error');
frontend.once('error', (error) => writeLog(`Frontend process error: ${error.message}`));

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

frontend.once('exit', (code, signal) => {
  if (!stopping) {
    writeLog(`Frontend stopped unexpectedly${code === null ? '' : ` (exit ${code})`}${signal ? ` (signal ${signal})` : ''}.`);
    stop(code ?? 1);
  }
});
