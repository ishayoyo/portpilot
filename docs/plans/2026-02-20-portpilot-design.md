# portpilot — Validated Design

## Overview
Beautiful, fast, cross-platform CLI to see what's using your ports and kill it. One command, zero config.

**Target:** Standalone npm CLI tool. `npx portpilot 3000` works instantly.

## Decisions Made
- **Vibe:** Professional quality code AND eye-catching terminal UI
- **Dependencies:** Zero extra deps beyond `picocolors` — all animations hand-rolled with ANSI codes
- **Testing:** Skip test framework for now, focus on making it work
- **Visual style:** Sleek minimal — box-drawing tables, braille spinner, subtle colors

## Commands

```bash
portpilot 3000                  # Show what's on port 3000
portpilot 3000 --kill           # Kill immediately, no prompt
portpilot 3000 4000 8080        # Check multiple ports
portpilot 3000 4000 --kill      # Kill multiple
portpilot --scan                # Show all listening ports
portpilot 3000 --free           # Kill + confirm port is free
```

## Visual Design

### Table output (box-drawing frame)
```
  ┌─────────────────────────────────────────────────────────┐
  │  PORT    PID      PROCESS            UPTIME    MEMORY   │
  ├─────────────────────────────────────────────────────────┤
  │  3000    14523    node (next)        2h 14m    128MB    │
  └─────────────────────────────────────────────────────────┘
```

### Kill feedback (animated braille spinner → checkmark)
```
  ⠋ Killing node (PID 14523)...
  ✓ Killed node (PID 14523) on port 3000
```

### Colors
- Cyan: port numbers
- Dim gray: PID, uptime, metadata
- Green: success checkmarks
- Red: error crosses
- Bold: process names in prompts

### Spinner
Hand-rolled braille dots: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`
Pure ANSI cursor manipulation, no dependencies.

## Architecture

### Tech Stack
- TypeScript compiled to ESM
- Node.js 18+
- Only dependency: `picocolors`
- Build tool: `tsup`

### Platform Interface
```typescript
interface ProcessInfo {
  port: number;
  pid: number;
  name: string;
  command: string;
  memory: number;   // bytes
  uptime: string;   // formatted "2h 14m"
}

interface Platform {
  getProcessOnPort(port: number): Promise<ProcessInfo | null>;
  getListeningPorts(): Promise<ProcessInfo[]>;
  killProcess(pid: number, force?: boolean): Promise<boolean>;
}
```

### Platform implementations
- **macOS/Linux:** `lsof` for port lookup, `ps` for process details
- **Windows:** `netstat -ano` for port lookup, `tasklist`/`wmic` for process details

### File Structure
```
portpilot/
  src/
    cli.ts              # Entry point, arg parsing
    platform/
      index.ts          # Platform detection
      darwin.ts         # macOS (re-exports unix)
      linux.ts          # Linux (re-exports unix)
      unix.ts           # Shared macOS/Linux logic
      win32.ts          # Windows implementation
    ui.ts               # Table formatting, colors, spinner, prompts
    types.ts            # Shared interfaces
  bin/
    portpilot.js        # Shebang entry
  package.json
  tsconfig.json
  .gitignore
  LICENSE
  README.md
```
