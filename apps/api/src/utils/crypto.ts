import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(encryptionKey: string): Buffer {
  const keyHex = encryptionKey.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be a 64-char hex string (32-byte key)");
  }
  return Buffer.from(keyHex, "hex");
}

export function encryptText(plainText: string, encryptionKey: string): string {
  const key = getKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptText(token: string, encryptionKey: string): string {
  const key = getKey(encryptionKey);
  const [ivB64, encryptedB64, tagB64] = token.split(".");
  if (!ivB64 || !encryptedB64 || !tagB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64url")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
