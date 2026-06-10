// watchout/crypto.js
// AES-256-CBC, PKCS5/PKCS7 padding, fixed 16-zero-byte IV — per the Watchout
// (PRIME) spec. Node's crypto defaults to PKCS7 padding for CBC, which matches
// Java's PKCS5Padding for a 16-byte block.
//
// Key encoding matters: AES-256 needs exactly 32 bytes once decoded. The
// provided key may be a 32-char utf8 string, 64 hex chars, or base64 — set
// WATCHOUT_AES_KEY_ENCODING accordingly. We validate the decoded length so a
// wrong encoding fails loudly instead of producing garbage ciphertext.

import crypto from "node:crypto";
import { getWatchoutConfig } from "./config.js";

const IV = Buffer.alloc(16, 0); // 16 zero bytes

export class WatchoutCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = "WatchoutCryptoError";
  }
}

function keyBuffer() {
  const { aesKey, aesKeyEncoding } = getWatchoutConfig();
  if (!aesKey) {
    throw new WatchoutCryptoError("WATCHOUT_AES_KEY is not set.");
  }
  let buf;
  try {
    buf = Buffer.from(aesKey, aesKeyEncoding);
  } catch {
    throw new WatchoutCryptoError(
      `Could not decode WATCHOUT_AES_KEY as ${aesKeyEncoding}.`
    );
  }
  if (buf.length !== 32) {
    throw new WatchoutCryptoError(
      `AES-256 requires a 32-byte key; decoded length is ${buf.length} ` +
        `(encoding="${aesKeyEncoding}"). Check WATCHOUT_AES_KEY / WATCHOUT_AES_KEY_ENCODING.`
    );
  }
  return buf;
}

export function encrypt(plain) {
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer(), IV);
  return Buffer.concat([
    cipher.update(String(plain), "utf8"),
    cipher.final(),
  ]).toString("base64");
}

export function decrypt(b64) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer(), IV);
  return Buffer.concat([
    decipher.update(Buffer.from(b64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// Quick self-check the operator can run after setting the key, to confirm the
// key/encoding round-trips before making any live call.
export function selfTest(sample = "watchout-crypto-selftest") {
  const out = decrypt(encrypt(sample));
  if (out !== sample) {
    throw new WatchoutCryptoError("AES round-trip mismatch — key/encoding wrong.");
  }
  return true;
}
