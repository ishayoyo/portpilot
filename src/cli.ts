import { getPlatform } from './platform/index.js';
import { printTable, printPortFree, printError, printScanSummary, confirm, createSpinner } from './ui.js';
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
  console.log('portpilot v0.1.0');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const platform = await getPlatform();

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
        spinner.stop('');
        printError(`Failed to kill PID ${proc.pid} — try running with elevated privileges`);
      }
    }
  }
}

main().catch((err) => {
  printError(err.message);
  process.exit(1);
});
