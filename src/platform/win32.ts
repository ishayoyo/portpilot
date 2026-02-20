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

// Batch-fetch process details for multiple PIDs in a single wmic call
function getBatchProcessDetails(pids: number[]): Map<number, { name: string; command: string; memory: number; uptime: string }> {
  const result = new Map<number, { name: string; command: string; memory: number; uptime: string }>();
  if (pids.length === 0) return result;

  // Initialize all PIDs with defaults
  for (const pid of pids) {
    result.set(pid, { name: 'unknown', command: 'unknown', memory: 0, uptime: '' });
  }

  try {
    // Single wmic call to get Name, CommandLine, WorkingSetSize, CreationDate for all PIDs
    const pidFilter = pids.map(p => `ProcessId=${p}`).join(' or ');
    const wmicOut = execSync(
      `wmic process where "${pidFilter}" get ProcessId,Name,CommandLine,WorkingSetSize,CreationDate /FORMAT:CSV`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 }
    );

    for (const line of wmicOut.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Node,')) continue;

      // CSV format: Node,CommandLine,CreationDate,Name,ProcessId,WorkingSetSize
      // But CommandLine can contain commas, so we parse carefully
      const match = trimmed.match(/^[^,]*,(.*),(\d{14}\.\d+[+-]\d+),([^,]+),(\d+),(\d+)$/);
      if (!match) continue;

      const [, commandLine, creationDate, name, pidStr, workingSet] = match;
      const pid = parseInt(pidStr, 10);
      if (!result.has(pid)) continue;

      const processName = name.replace('.exe', '');
      const memory = parseInt(workingSet, 10);
      const command = commandLine?.trim() || processName;

      let uptime = '';
      const timeMatch = creationDate.match(/^(\d{14})/);
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

      result.set(pid, { name: processName, command, memory, uptime });
    }
  } catch {
    // Fallback: try tasklist for names at least
    try {
      const tasklistOut = execSync('tasklist /FO CSV /NH', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      const pidSet = new Set(pids);
      for (const line of tasklistOut.split('\n')) {
        const csvMatch = line.match(/"([^"]+)","(\d+)","[^"]*","[^"]*","([\d,]+)\s*K"/);
        if (!csvMatch) continue;
        const pid = parseInt(csvMatch[2], 10);
        if (!pidSet.has(pid)) continue;
        const name = csvMatch[1].replace('.exe', '');
        const memory = parseInt(csvMatch[3].replace(/,/g, ''), 10) * 1024;
        const existing = result.get(pid)!;
        result.set(pid, { ...existing, name, command: name, memory });
      }
    } catch {}
  }

  return result;
}

// Single-PID fetch (for getProcessOnPort — only 1 process)
function getProcessDetails(pid: number): { name: string; command: string; memory: number; uptime: string } {
  const batch = getBatchProcessDetails([pid]);
  return batch.get(pid) ?? { name: 'unknown', command: 'unknown', memory: 0, uptime: '' };
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

      // First pass: collect all unique port/pid pairs
      const portPidMap = new Map<number, number>();
      for (const line of output.split('\n')) {
        const parsed = parseNetstatLineAny(line);
        if (!parsed || portPidMap.has(parsed.port)) continue;
        portPidMap.set(parsed.port, parsed.pid);
      }

      // Batch-fetch all process details in one call
      const uniquePids = [...new Set(portPidMap.values())];
      const detailsMap = getBatchProcessDetails(uniquePids);

      // Build results
      const results: ProcessInfo[] = [];
      for (const [port, pid] of portPidMap) {
        const details = detailsMap.get(pid) ?? { name: 'unknown', command: 'unknown', memory: 0, uptime: '' };
        results.push({ port, pid, ...details });
      }

      return results.sort((a, b) => a.port - b.port);
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
