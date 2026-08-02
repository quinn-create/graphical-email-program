# Architecture

Electron main owns network, AI, extraction, SQLite, and secrets.  
Renderer is sandboxed with contextIsolation and a typed preload IPC bridge validated with Zod.

Packages under `packages/` implement domain logic. Mock adapters enable Demo mode without credentials.
