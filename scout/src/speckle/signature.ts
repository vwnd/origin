/**
 * Speckle signs each delivery with `HMAC-SHA256(secret, rawBody)` and sends the
 * hex digest in the `X-WEBHOOK-SIGNATURE` header. The HMAC covers the exact
 * bytes on the wire, so always verify against the raw body text — never against
 * a re-serialized object.
 */

export const SIGNATURE_HEADER = "X-WEBHOOK-SIGNATURE";

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verify the delivery signature. Uses `crypto.subtle.verify`, which compares in
 * constant time, so no timing side-channel on the digest.
 */
export async function verifySignature({
  rawBody,
  signature,
  secret
}: {
  rawBody: string;
  signature: string | null;
  secret: string;
}): Promise<boolean> {
  if (!signature) return false;

  const expected = hexToBytes(signature.trim());
  if (!expected) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return await crypto.subtle.verify(
    "HMAC",
    key,
    expected as BufferSource,
    encoder.encode(rawBody)
  );
}

/**
 * Constant-time string comparison for shared secrets.
 *
 * Both sides are hashed to a fixed 32 bytes first, so the comparison length is
 * constant and the length of the expected secret cannot leak. The XOR-accumulate
 * loop always runs the full digest — no early exit on first mismatch.
 */
export async function timingSafeEqualStrings(
  a: string,
  b: string
): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b))
  ]);

  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}
