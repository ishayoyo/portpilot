# portpilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a beautiful, cross-platform CLI tool to show what's using your ports and kill it. Showcase-quality GitHub project.

**Architecture:** Standalone TypeScript CLI tool published to npm. Platform-specific modules handle OS differences (lsof on Mac/Linux, netstat on Windows). Thin CLI layer parses args, delegates to platform modules, renders output via a polished UI module with box-drawing tables and hand-rolled braille spinner.

**Tech Stack:** TypeScript, Node.js 18+, picocolors (only runtime dep), tsup (build)

**Project root:** `D:/portpilot`

---

### Task 1: Project Scaffold

**Files:**
- Create: `D:/portpilot/package.json`
- Create: `D:/portpilot/tsconfig.json`
- Create: `D:/portpilot/src/types.ts`
- Create: `D:/portpilot/bin/portpilot.js`
- Create: `D:/portpilot/.gitignore`
- Create: `D:/portpilot/LICENSE`

**Step 1: Init git**

```bash
cd D:/portpilot
git init
```

**Step 2: Create package.json**

```json
{
  "name": "portpilot",
  "version": "0.1.0",
  "description": "See what's using your ports. Kill it.",
  "type": "module",
  "main": "dist/cli.js",
  "bin": {
    "portpilot": "./bin/portpilot.js"
  },
  "scripts": {
    "build": "tsup src/cli.ts --format esm --clean",
    "dev": "tsup src/cli.ts --format esm --watch",
    "lint": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "dist",
    "bin"
  ],
  "engines": {
    "node": ">=18"
  },
  "keywords": [
    "port",
    "kill",
    "process",
    "cli",
    "terminal",
    "devtools",
    "kill-port",
    "free-port",
    "cross-platform"
  ],
  "author": "Ishay Almuly",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/ishayoyo/portpilot"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create src/types.ts**

```typescript
export interface ProcessInfo {
  port: number;
  pid: number;
  name: string;
  command: string;
  memory: number;   // bytes
  uptime: string;   // formatted string like "2h 14m"
}

export interface Platform {
  getProcessOnPort(port: number): Promise<ProcessInfo | null>;
  getListeningPorts(): Promise<ProcessInfo[]>;
  killProcess(pid: number, force?: boolean): Promise<boolean>;
}

export interface CliOptions {
  ports: number[];
  kill: boolean;
  free: boolean;
  scan: boolean;
}
```

**Step 5: Create bin/portpilot.js**

```javascript
#!/usr/bin/env node
import '../dist/cli.js';
```

**Step 6: Create .gitignore**

```
node_modules/
dist/
*.tgz
```

**Step 7: Create LICENSE**

Standard MIT license with "Ishay Almuly" and year 2026.

**Step 8: Install dependencies**

```bash
cd D:/portpilot
npm install picocolors
npm install -D typescript tsup @types/node
```

**Step 9: Commit**

```bash
git add package.json tsconfig.json src/types.ts bin/portpilot.js .gitignore LICENSE package-lock.json
git commit -m "chore: scaffold portpilot project"
```

---

### Task 2: Platform Layer — Windows

**Files:**
- Create: `D:/portpilot/src/platform/win32.ts`

**Step 1: Implement win32.ts**

This module uses `netstat -ano` to find listening ports and their PIDs, then `tasklist` for process name/memory and `wmic` for command line and creation time.

```typescript
// src/platform/win32.ts
import { execSync } from 'node:child_process';
import type { ProcessInfo, Platform } from '../types.js';

function parseNetstatLine(line: string, targetPort: number): { port: number; pid: number } | null {
  const trimmed = line.trim();
  if (!trimmed.includes('LISTENING')) return null;

  const parts = trimmed.split(/\s+/);
  const localAddr = parts[1];
  const pid = parseInt(parts[parts.length - 1], 10);

  if (isNaN(pid) || pid === 0) return null;

  const portMatch = localAddr.match(/:(\d+)$/);
  if (!portMatch) return null;

  const port = parseInt(portMatch[1], 10);
  if (port !== targetPort) return null;

  return { port, pid };
}

function parseNetstatLineAny(line: string): { port: number; pid: number } | null {
  const trimmed = line.trim();
  if (!trimmed.includes('LISTENING')) return null;

  const parts = trimmed.split(/\s+/);
  const localAddr = parts[1];
  const pid = parseInt(parts[parts.length - 1], 10);

  if (isNaN(pid) || pid === 0) return null;

  const portMatch = localAddr.match(/:(\d+)$/);
  if (!portMatch) return null;

  return { port: parseInt(portMatch[1], 10), pid };
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function getProcessDetails(pid: number): { name: string; command: string; memory: number; uptime: string } {
  try {
    // Get process name and memory via tasklist
    const tasklistOut = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const csvMatch = tasklistOut.match(/"([^"]+)","(\d+)","[^"]*","[^"]*","([\d,]+)\s*K"/);
    const name = csvMatch ? csvMatch[1].replace('.exe', '') : 'unknown';
    const memory = csvMatch ? parseInt(csvMatch[3].replace(/,/g, ''), 10) * 1024 : 0;

    // Get command line via wmic
    let command = name;
    try {
      const wmicOut = execSync(
        `wmic process where processid=${pid} get CommandLine /FORMAT:VALUE`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const cmdMatch = wmicOut.match(/CommandLine=(.+)/);
      if (cmdMatch && cmdMatch[1].trim()) command = cmdMatch[1].trim();
    } catch {}

    // Get uptime via CreationDate
    let uptime = '';
    try {
      const wmicTime = execSync(
        `wmic process where processid=${pid} get CreationDate /FORMAT:VALUE`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const timeMatch = wmicTime.match(/CreationDate=(\d{14})/);
      if (timeMatch) {
        const s = timeMatch[1];
        const created = new Date(
          parseInt(s.slice(0, 4)),
          parseInt(s.slice(4, 6)) - 1,
          parseInt(s.slice(6, 8)),
          parseInt(s.slice(8, 10)),
          parseInt(s.slice(10, 12)),
          parseInt(s.slice(12, 14))
        );
        uptime = formatUptime(Date.now() - created.getTime());
      }
    } catch {}

    return { name, command, memory, uptime };
  } catch {
    return { name: 'unknown', command: 'unknown', memory: 0, uptime: '' };
  }
}

export const win32Platform: Platform = {
  async getProcessOnPort(port: number): Promise<ProcessInfo | null> {
    try {
      const output = execSync('netstat -ano -p TCP', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      for (const line of output.split('\n')) {
        const parsed = parseNetstatLine(line, port);
        if (parsed) {
          const details = getProcessDetails(parsed.pid);
          return { port: parsed.port, pid: parsed.pid, ...details };
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  async getListeningPorts(): Promise<ProcessInfo[]> {
    try {
      const output = execSync('netstat -ano -p TCP', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const seen = new Map<number, ProcessInfo>();

      for (const line of output.split('\n')) {
        const parsed = parseNetstatLineAny(line);
        if (!parsed || seen.has(parsed.port)) continue;

        const details = getProcessDetails(parsed.pid);
        seen.set(parsed.port, { port: parsed.port, pid: parsed.pid, ...details });
      }

      return [...seen.values()].sort((a, b) => a.port - b.port);
    } catch {
      return [];
    }
  },

  async killProcess(pid: number, force = false): Promise<boolean> {
    try {
      execSync(`taskkill ${force ? '/F' : ''} /PID ${pid}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch {
      if (!force) {
        try {
          execSync(`taskkill /F /PID ${pid}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          return true;
        } catch {}
      }
      return false;
    }
  },
};
```

**Step 2: Commit**

```bash
git add src/platform/win32.ts
git commit -m "feat: add Windows platform layer"
```

---

### Task 3: Platform Layer — macOS/Linux

**Files:**
- Create: `D:/portpilot/src/platform/unix.ts`
- Create: `D:/portpilot/src/platform/darwin.ts`
- Create: `D:/portpilot/src/platform/linux.ts`

**Step 1: Implement unix.ts (shared macOS/Linux logic)**

Uses `lsof` for port lookup and `ps` for process details. The `parseEtime` function converts `ps` elapsed time format to human-readable strings.

```typescript
// src/platform/unix.ts
import { execSync } from 'node:child_process';
import type { ProcessInfo, Platform } from '../types.js';

function parseLsofLine(line: string): { name: string; pid: number } | null {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === 'COMMAND') return null;
  const pid = parseInt(parts[1], 10);
  if (isNaN(pid)) return null;
  return { name: parts[0], pid };
}

function parseEtime(etime: string): string {
  const trimmed = etime.trim();

  const dayMatch = trimmed.match(/^(\d+)-(\d+):(\d+):(\d+)$/);
  if (dayMatch) return `${parseInt(dayMatch[1])}d ${parseInt(dayMatch[2])}h`;

  const hmsMatch = trimmed.match(/^(\d+):(\d+):(\d+)$/);
  if (hmsMatch) return `${parseInt(hmsMatch[1])}h ${parseInt(hmsMatch[2])}m`;

  const msMatch = trimmed.match(/^(\d+):(\d+)$/);
  if (msMatch) return `${parseInt(msMatch[1])}m ${parseInt(msMatch[2])}s`;

  return `${parseInt(trimmed)}s`;
}

function getProcessDetails(pid: number): { command: string; memory: number; uptime: string } {
  try {
    const psOut = execSync(`ps -p ${pid} -o rss=,etime=,args=`, { encoding: 'utf-8' }).trim();
    const parts = psOut.trim().split(/\s+/);
    const rss = parseInt(parts[0], 10) * 1024;
    const etime = parts[1];
    const command = parts.slice(2).join(' ');
    return { command, memory: rss, uptime: parseEtime(etime) };
  } catch {
    return { command: 'unknown', memory: 0, uptime: '' };
  }
}

export function createUnixPlatform(): Platform {
  return {
    async getProcessOnPort(port: number): Promise<ProcessInfo | null> {
      try {
        const output = execSync(`lsof -i :${port} -P -n -sTCP:LISTEN`, { encoding: 'utf-8' });
        for (const line of output.trim().split('\n')) {
          const parsed = parseLsofLine(line);
          if (parsed) {
            const details = getProcessDetails(parsed.pid);
            return { port, pid: parsed.pid, name: parsed.name, ...details };
          }
        }
        return null;
      } catch {
        return null;
      }
    },

    async getListeningPorts(): Promise<ProcessInfo[]> {
      try {
        const output = execSync('lsof -i -P -n -sTCP:LISTEN', { encoding: 'utf-8' });
        const seen = new Map<number, ProcessInfo>();

        for (const line of output.trim().split('\n')) {
          const parsed = parseLsofLine(line);
          if (!parsed) continue;

          const portMatch = line.match(/:(\d+)\s+\(LISTEN\)/);
          if (!portMatch) continue;
          const port = parseInt(portMatch[1], 10);

          if (!seen.has(port)) {
            const details = getProcessDetails(parsed.pid);
            seen.set(port, { port, pid: parsed.pid, name: parsed.name, ...details });
          }
        }

        return [...seen.values()].sort((a, b) => a.port - b.port);
      } catch {
        return [];
      }
    },

    async killProcess(pid: number, force = false): Promise<boolean> {
      try {
        process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
        return true;
      } catch {
        if (!force) {
          try {
            process.kill(pid, 'SIGKILL');
            return true;
          } catch {}
        }
        return false;
      }
    },
  };
}
```

**Step 2: Create darwin.ts and linux.ts (thin re-exports)**

```typescript
// src/platform/darwin.ts
export { createUnixPlatform as createPlatform } from './unix.js';

// src/platform/linux.ts
export { createUnixPlatform as createPlatform } from './unix.js';
```

**Step 3: Commit**

```bash
git add src/platform/unix.ts src/platform/darwin.ts src/platform/linux.ts
git commit -m "feat: add macOS/Linux platform layer"
```

---

### Task 4: Platform Index (auto-detect OS)

**Files:**
- Create: `D:/portpilot/src/platform/index.ts`

**Step 1: Implement platform detection**

Uses dynamic imports so only the current OS module is loaded.

```typescript
// src/platform/index.ts
import { platform } from 'node:os';
import type { Platform } from '../types.js';

export async function getPlatform(): Promise<Platform> {
  const os = platform();

  switch (os) {
    case 'win32': {
      const { win32Platform } = await import('./win32.js');
      return win32Platform;
    }
    case 'darwin': {
      const { createPlatform } = await import('./darwin.js');
      return createPlatform();
    }
    case 'linux': {
      const { createPlatform } = await import('./linux.js');
      return createPlatform();
    }
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}
```

**Step 2: Commit**

```bash
git add src/platform/index.ts
git commit -m "feat: add platform auto-detection"
```

---

### Task 5: UI Module — Polished Terminal Output

**Files:**
- Create: `D:/portpilot/src/ui.ts`

**Step 1: Implement the UI module**

This is the showcase piece. Features:
- Box-drawing table with `┌─┐│├─┤└─┘` characters
- Hand-rolled braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) using raw ANSI cursor control
- Color palette: cyan ports, dim metadata, green success, red errors
- 2-space indent for all output (breathing room)

```typescript
// src/ui.ts
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
const TABLE_WIDTH = COL.port + COL.pid + COL.process + COL.uptime + COL.memory + 4; // +4 for padding

// ── Table output ──

export function printTable(processes: ProcessInfo[]): void {
  if (processes.length === 0) return;

  const inner = TABLE_WIDTH;

  console.log();
  console.log(`  ${pc.dim('┌' + '─'.repeat(inner) + '┐')}`);

  // Header
  const header =
    `  ${pad('PORT', COL.port)}` +
    `${pad('PID', COL.pid)}` +
    `${pad('PROCESS', COL.process)}` +
    `${pad('UPTIME', COL.uptime)}` +
    `${pad('MEMORY', COL.memory)}`;
  console.log(`  ${pc.dim('│')} ${pc.dim(header)}${pc.dim('│')}`);
  console.log(`  ${pc.dim('├' + '─'.repeat(inner) + '┤')}`);

  // Rows
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
```

**Step 2: Commit**

```bash
git add src/ui.ts
git commit -m "feat: add polished terminal UI with box tables and spinner"
```

---

### Task 6: CLI Entry Point

**Files:**
- Create: `D:/portpilot/src/cli.ts`

**Step 1: Implement CLI with arg parsing and main flow**

The CLI parses args, delegates to platform, and uses the UI module for all output. The spinner is used during kill operations.

```typescript
// src/cli.ts
import { getPlatform } from './platform/index.js';
import { printTable, printPortFree, printKilled, printError, printScanSummary, confirm, createSpinner } from './ui.js';
import pc from 'picocolors';
import type { CliOptions } from './types.js';

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const ports: number[] = [];
  let kill = false;
  let free = false;
  let scan = false;

  for (const arg of args) {
    if (arg === '--kill' || arg === '-k') {
      kill = true;
    } else if (arg === '--free' || arg === '-f') {
      free = true;
      kill = true;
    } else if (arg === '--scan' || arg === '-s') {
      scan = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      printVersion();
      process.exit(0);
    } else {
      const port = parseInt(arg, 10);
      if (!isNaN(port) && port > 0 && port <= 65535) {
        ports.push(port);
      } else {
        printError(`Invalid port: ${arg}`);
        process.exit(1);
      }
    }
  }

  if (!scan && ports.length === 0) {
    printHelp();
    process.exit(0);
  }

  return { ports, kill, free, scan };
}

function printHelp(): void {
  console.log(`
  ${pc.bold('portpilot')} — See what's using your ports. Kill it.

  ${pc.dim('Usage:')}
    portpilot <port> [port...]     Show what's on a port
    portpilot <port> --kill        Kill immediately
    portpilot <port> --free        Kill + verify port is free
    portpilot --scan               Show all listening ports

  ${pc.dim('Options:')}
    -k, --kill     Kill without prompt
    -f, --free     Kill and verify port is freed
    -s, --scan     Show all listening ports
    -h, --help     Show this help
    -v, --version  Show version

  ${pc.dim('Examples:')}
    ${pc.cyan('$')} portpilot 3000
    ${pc.cyan('$')} portpilot 3000 8080 --kill
    ${pc.cyan('$')} portpilot --scan
`);
}

function printVersion(): void {
  // Read from package.json at runtime would be ideal, but for simplicity:
  console.log('portpilot v0.1.0');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const platform = await getPlatform();

  // Scan mode
  if (options.scan) {
    const processes = await platform.getListeningPorts();
    if (processes.length === 0) {
      console.log();
      console.log(`  ${pc.green('✓')} No listening ports found`);
      console.log();
      return;
    }
    printTable(processes);
    printScanSummary(processes.length);
    return;
  }

  // Port check/kill mode
  for (const port of options.ports) {
    const proc = await platform.getProcessOnPort(port);

    if (!proc) {
      printPortFree(port);
      continue;
    }

    printTable([proc]);

    let shouldKill = options.kill;
    if (!shouldKill) {
      shouldKill = await confirm(`Kill ${pc.bold(proc.name)} on port ${pc.cyan(String(port))}?`);
    }

    if (shouldKill) {
      const spinner = createSpinner(`Killing ${proc.name} ${pc.dim(`(PID ${proc.pid})`)}...`);
      const killed = await platform.killProcess(proc.pid);

      if (killed) {
        spinner.stop(`Killed ${pc.bold(proc.name)} ${pc.dim(`(PID ${proc.pid})`)} on port ${pc.cyan(String(port))}`);

        if (options.free) {
          await new Promise((r) => setTimeout(r, 500));
          const check = await platform.getProcessOnPort(port);
          if (check) {
            printError(`Port ${port} is still in use by PID ${check.pid}`);
          } else {
            printPortFree(port);
          }
        }
      } else {
        spinner.stop(''); // clear the spinner line
        printError(`Failed to kill PID ${proc.pid} — try running with elevated privileges`);
      }
    }
  }
}

main().catch((err) => {
  printError(err.message);
  process.exit(1);
});
```

**Step 2: Build and verify**

```bash
cd D:/portpilot && npm run build
node bin/portpilot.js --help
node bin/portpilot.js --scan
```

Expected: Help text displays with colors and formatting. Scan shows listening ports in a box-drawn table.

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add CLI entry point with arg parsing and spinner"
```

---

### Task 7: Manual Integration Test

**Step 1: Start a test server and verify portpilot**

```bash
cd D:/portpilot
npm run build

# Start a test HTTP server on port 9876 in background
node -e "require('http').createServer((req, res) => res.end('ok')).listen(9876)" &

# Test each command
node bin/portpilot.js 9876            # Should show table with node process
node bin/portpilot.js 9876 --kill     # Should show spinner then kill confirmation
node bin/portpilot.js 9876            # Should show "Port 9876 is free"
node bin/portpilot.js --scan          # Should show all listening ports
node bin/portpilot.js 55555           # Should show "Port 55555 is free"
node bin/portpilot.js --help          # Should show help text
```

**Step 2: Fix any issues found**

Common issues to watch for:
- Windows `wmic` deprecation warnings printing to stdout (use `stdio: ['pipe', 'pipe', 'pipe']` to suppress stderr)
- Table column alignment off when process names are long
- Spinner not clearing properly on Windows (may need `\x1b[K` to clear line)

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: integration test fixes"
```

---

### Task 8: README

**Files:**
- Create: `D:/portpilot/README.md`

**Step 1: Write a showcase-quality README**

The README must be short, punchy, and visual. Structure:

1. **Title + one-liner** — `portpilot` + "See what's using your ports. Kill it."
2. **npm badge** — version badge from shields.io
3. **Screenshot placeholder** — `<!-- screenshot goes here -->` comment (record a real GIF after everything works)
4. **Quick start** — `npx portpilot 3000` front and center
5. **Usage examples** — all commands with representative terminal output
6. **Why portpilot** — comparison table vs fkill-cli, kill-port
7. **Cross-platform** — macOS, Linux, Windows badges/note
8. **Install options** — npx, global npm install
9. **License** — MIT

Keep it under 100 lines. No walls of text.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

### Task 9: Final Polish and Build Verification

**Step 1: Verify the package contents**

```bash
cd D:/portpilot
npm run build
npm pack --dry-run
```

Check that only `dist/` and `bin/` are included. No source files, no docs.

**Step 2: Verify the built CLI works end-to-end**

```bash
node bin/portpilot.js --version
node bin/portpilot.js --scan
```

**Step 3: Final commit and tag**

```bash
git add -A
git commit -m "chore: final polish"
git tag v0.1.0
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Project scaffold | package.json, tsconfig, types, bin, gitignore, LICENSE |
| 2 | Windows platform | src/platform/win32.ts |
| 3 | macOS/Linux platform | src/platform/unix.ts, darwin.ts, linux.ts |
| 4 | Platform index | src/platform/index.ts |
| 5 | UI module (showcase piece) | src/ui.ts |
| 6 | CLI entry point | src/cli.ts |
| 7 | Integration testing | (manual, fix bugs) |
| 8 | README | README.md |
| 9 | Final polish + build | (verify and tag) |
