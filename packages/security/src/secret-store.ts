import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SecretStoreCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(buf: Buffer): string;
}

/** File-backed secret store. Prefer Electron safeStorage when available. */
export class SecretStore {
  constructor(
    private readonly dir: string,
    private readonly crypto?: SecretStoreCrypto | null,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  private pathFor(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.dir, `${safe}.bin`);
  }

  save(key: string, value: string): { masked: string } {
    const file = this.pathFor(key);
    if (this.crypto?.isEncryptionAvailable()) {
      writeFileSync(file, this.crypto.encryptString(value));
    } else {
      writeFileSync(file, Buffer.from(value, "utf8"), { mode: 0o600 });
    }
    return { masked: maskSecret(value) };
  }

  load(key: string): string | null {
    const file = this.pathFor(key);
    if (!existsSync(file)) return null;
    const buf = readFileSync(file);
    if (buf.length === 0) return null;
    if (this.crypto?.isEncryptionAvailable()) {
      try {
        return this.crypto.decryptString(buf);
      } catch {
        return buf.toString("utf8");
      }
    }
    return buf.toString("utf8");
  }

  remove(key: string): void {
    const file = this.pathFor(key);
    if (existsSync(file)) unlinkSync(file);
  }

  has(key: string): boolean {
    return existsSync(this.pathFor(key));
  }
}

export function maskSecret(value: string): string {
  if (value.length <= 6) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}
