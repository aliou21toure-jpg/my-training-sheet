/**
 * Password hashing with argon2id (OWASP-recommended parameters:
 * 19 MiB memory, 2 iterations, 1 lane — the library defaults).
 */
import { hash, verify } from "@node-rs/argon2";

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false; // malformed hash: never a match, never a crash
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * When the email is unknown we still run one argon2 verification, so the
 * response time does not reveal whether the account exists.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hash("dummy-password-for-timing-only");
  await verify(await dummyHash, password).catch(() => false);
  return false;
}
