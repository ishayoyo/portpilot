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
