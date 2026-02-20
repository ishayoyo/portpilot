# porthub

> See what's using your ports. Kill it.

[![npm version](https://img.shields.io/npm/v/porthub.svg)](https://www.npmjs.com/package/porthub)
[![license](https://img.shields.io/npm/l/porthub.svg)](https://github.com/ishayoyo/porthub/blob/main/LICENSE)

<!-- TODO: Add terminal GIF recording here -->

## Quick Start

```bash
npx porthub 3000
```

That's it. No install, no config.

## Usage

```bash
# See what's on a port
porthub 3000

# Kill it immediately
porthub 3000 --kill

# Check multiple ports
porthub 3000 4000 8080

# Kill multiple
porthub 3000 4000 --kill

# See all listening ports
porthub --scan

# Kill + verify it's free
porthub 3000 --free
```

### Example Output

```
  ┌────────────────────────────────────────────────────────────┐
  │  PORT    PID       PROCESS           UPTIME      MEMORY   │
  ├────────────────────────────────────────────────────────────┤
  │  3000    14523     node              2h 14m      128MB    │
  └────────────────────────────────────────────────────────────┘

  Kill node on port 3000? (y/N)
```

```
  ✓ Killed node (PID 14523) on port 3000
```

## Install

```bash
# Use directly (no install)
npx porthub 3000

# Or install globally
npm i -g porthub
```

## Why porthub?

| | porthub | kill-port | fkill-cli |
|---|---|---|---|
| Shows process info before kill | Yes | No | No |
| Memory & uptime | Yes | No | No |
| Scan all ports | Yes | No | No |
| Interactive prompt | Yes | No | Yes |
| Cross-platform | Yes | Yes | Yes |
| Dependencies | 1 | 3 | 11 |
| Maintained | Yes | Stale | Stale |

## Cross-Platform

Works on **macOS**, **Linux**, and **Windows** out of the box.

- macOS/Linux: uses `lsof` + `ps`
- Windows: uses `netstat` + `wmic` (batched for speed)

## Requirements

Node.js 18+

## License

MIT
