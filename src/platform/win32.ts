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
    const tasklistOut = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const csvMatch = tasklistOut.match(/"([^"]+)","(\d+)","[^"]*","[^"]*","([\d,]+)\s*K"/);
    const name = csvMatch ? csvMatch[1].replace('.exe', '') : 'unknown';
    const memory = csvMatch ? parseInt(csvMatch[3].replace(/,/g, ''), 10) * 1024 : 0;

    let command = name;
    try {
      const wmicOut = execSync(
        `wmic process where processid=${pid} get CommandLine /FORMAT:VALUE`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const cmdMatch = wmicOut.match(/CommandLine=(.+)/);
      if (cmdMatch && cmdMatch[1].trim()) command = cmdMatch[1].trim();
    } catch {}

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
