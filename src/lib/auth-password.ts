import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_PREFIX = "scrypt_v1";

function encodeBase64(value: Buffer) {
  return value.toString("base64url");
}

function decodeBase64(value: string) {
  return Buffer.from(value, "base64url");
}

function derive(password: string, salt: Buffer) {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = derive(password, salt);
  return `${HASH_PREFIX}$${encodeBase64(salt)}$${encodeBase64(hash)}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const parts = passwordHash.split("$");
  if (parts.length !== 3) return false;
  if (parts[0] !== HASH_PREFIX) return false;

  try {
    const salt = decodeBase64(parts[1]);
    const storedHash = decodeBase64(parts[2]);
    const actual = derive(password, salt);
    if (storedHash.length !== actual.length) return false;
    return timingSafeEqual(storedHash, actual);
  } catch {
    return false;
  }
}
