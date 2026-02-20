import pc from 'picocolors';
import type { ProcessInfo } from './types.js';

// ── Formatting helpers ──

function formatMemory(bytes: number): string {
  if (bytes === 0) return '–';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${Math.round(mb)}MB`;
}

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

// ── Column widths ──

const COL = { port: 8, pid: 10, process: 18, uptime: 12, memory: 8 };
const TABLE_WIDTH = COL.port + COL.pid + COL.process + COL.uptime + COL.memory + 4;

// ── Table output ──

export function printTable(processes: ProcessInfo[]): void {
  if (processes.length === 0) return;

  const inner = TABLE_WIDTH;

  console.log();
  console.log(`  ${pc.dim('┌' + '─'.repeat(inner) + '┐')}`);

  const header =
    `  ${pad('PORT', COL.port)}` +
    `${pad('PID', COL.pid)}` +
    `${pad('PROCESS', COL.process)}` +
    `${pad('UPTIME', COL.uptime)}` +
    `${pad('MEMORY', COL.memory)}`;
  console.log(`  ${pc.dim('│')} ${pc.dim(header)}${pc.dim('│')}`);
  console.log(`  ${pc.dim('├' + '─'.repeat(inner) + '┤')}`);

  for (const p of processes) {
    const row =
      `  ${pc.cyan(pad(String(p.port), COL.port))}` +
      `${pc.dim(pad(String(p.pid), COL.pid))}` +
      `${pad(p.name, COL.process)}` +
      `${pc.dim(pad(p.uptime || '–', COL.uptime))}` +
      `${pad(formatMemory(p.memory), COL.memory)}`;
    console.log(`  ${pc.dim('│')} ${row}${pc.dim('│')}`);
  }

  console.log(`  ${pc.dim('└' + '─'.repeat(inner) + '┘')}`);
  console.log();
}

// ── Status messages ──

export function printPortFree(port: number): void {
  console.log();
  console.log(`  ${pc.green('✓')} Port ${pc.cyan(String(port))} is free`);
  console.log();
}

export function printKilled(proc: ProcessInfo): void {
  console.log(`  ${pc.green('✓')} Killed ${pc.bold(proc.name)} ${pc.dim(`(PID ${proc.pid})`)} on port ${pc.cyan(String(proc.port))}`);
}

export function printError(msg: string): void {
  console.log();
  console.log(`  ${pc.red('✗')} ${msg}`);
  console.log();
}

export function printScanSummary(count: number): void {
  console.log(`  ${pc.dim(`${count} port${count !== 1 ? 's' : ''} in use`)}`);
  console.log();
}

// ── Spinner ──

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function createSpinner(message: string): { stop: (finalMessage: string) => void } {
  let i = 0;
  const stream = process.stderr;

  const timer = setInterval(() => {
    const frame = pc.cyan(SPINNER_FRAMES[i % SPINNER_FRAMES.length]);
    stream.write(`\r  ${frame} ${message}`);
    i++;
  }, 80);

  return {
    stop(finalMessage: string) {
      clearInterval(timer);
      stream.write(`\r  ${pc.green('✓')} ${finalMessage}\x1b[K\n`);
    },
  };
}

// ── Prompt ──

export async function confirm(question: string): Promise<boolean> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`  ${question} ${pc.dim('(y/N)')} `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
