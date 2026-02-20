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
