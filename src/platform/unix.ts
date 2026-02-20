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
