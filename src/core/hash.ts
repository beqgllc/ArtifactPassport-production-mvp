function toArrayBuffer(
  bytes: Uint8Array<ArrayBufferLike>,
): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function sha256(
  bytes: Uint8Array,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    toArrayBuffer(bytes),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function artifactIdFromSha256(
  hash: string,
): string {
  return `AP-${hash.slice(0, 12).toUpperCase()}`;
}