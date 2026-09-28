import path from 'node:path';
import { defineConfig } from 'vite';
import appConfig from './vite.config';

// This config is used only by Playwright. Normal dev/build keep the real Clerk SDK.
const clerkShim = path.resolve(import.meta.dirname, 'src/e2e/clerk-shim.tsx');
const appAliases = appConfig.resolve?.alias;

if (!appAliases || Array.isArray(appAliases)) {
  throw new Error('The browser test server expects the app aliases to be a map.');
}

export default defineConfig({
  ...appConfig,
  resolve: {
    ...appConfig.resolve,
    alias: [
      { find: '@clerk/react/internal', replacement: clerkShim },
      { find: '@clerk/react', replacement: clerkShim },
      ...Object.entries(appAliases).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
});