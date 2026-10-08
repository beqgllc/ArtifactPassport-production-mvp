import { base64UrlToBytes, bytesToBase64Url } from './base64';
import type {
  ArtifactPassport,
  RemoteShareMetadata,
  ShareResponse,
} from './types';

function toArrayBuffer(
  bytes: Uint8Array<ArrayBufferLike>,
): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function encryptForHandoff(
  file: File,
): Promise<{
  ciphertext: Uint8Array;
  iv: Uint8Array;
  key: Uint8Array;
}> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    'AES-GCM',
    false,
    ['encrypt'],
  );

  const plaintext = new Uint8Array(await file.arrayBuffer());

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
      },
      key,
      toArrayBuffer(plaintext),
    ),
  );

  return {
    ciphertext,
    iv,
    key: keyBytes,
  };
}

export async function decryptHandoff(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  keyBytes: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    'AES-GCM',
    false,
    ['decrypt'],
  );

  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(ciphertext),
  );

  return new Uint8Array(plaintext);
}

export async function uploadEncryptedHandoff(
  endpoint: string,
  file: File,
  passport: ArtifactPassport,
  licenseToken = '',
): Promise<{
  share: ShareResponse;
  key: Uint8Array;
}> {
  const { ciphertext, iv, key } = await encryptForHandoff(file);

  const body = new Blob(
    [toArrayBuffer(ciphertext)],
    {
      type: 'application/octet-stream',
    },
  );

  const response = await fetch(
    `${endpoint.replace(/\/$/, '')}/api/share`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-artifact-filename': encodeURIComponent(file.name),
        'x-artifact-mime': file.type || 'application/octet-stream',
        'x-artifact-size': String(file.size),
        'x-artifact-sha256': passport.artifact.sha256,
        'x-artifact-iv': bytesToBase64Url(iv),
        'x-artifact-passport': bytesToBase64Url(
          new TextEncoder().encode(JSON.stringify(passport)),
        ),
        ...(licenseToken
          ? { 'x-ap-license': licenseToken }
          : {}),
        'content-length': String(ciphertext.byteLength),
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Share upload failed (${response.status}).`,
    );
  }

  const share = (await response.json()) as ShareResponse;

  return {
    share,
    key,
  };
}

export async function fetchRemoteMetadata(
  endpoint: string,
  token: string,
): Promise<RemoteShareMetadata> {
  const response = await fetch(
    `${endpoint.replace(/\/$/, '')}/api/share/${encodeURIComponent(token)}`,
  );

  if (!response.ok) {
    throw new Error(
      `Share not found (${response.status}).`,
    );
  }

  return (await response.json()) as RemoteShareMetadata;
}

export async function fetchRemoteCiphertext(
  endpoint: string,
  token: string,
): Promise<Uint8Array> {
  const response = await fetch(
    `${endpoint.replace(/\/$/, '')}/api/share/${encodeURIComponent(token)}/file`,
  );

  if (!response.ok) {
    throw new Error(
      `Shared artifact unavailable (${response.status}).`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

export function shareUrl(
  origin: string,
  token: string,
  key: Uint8Array,
): string {
  return `${
    origin.replace(/\/$/, '')
  }/#/share/${encodeURIComponent(token)}/${bytesToBase64Url(key)}`;
}

export function parseShareRoute(
  hash: string,
): {
  token: string;
  key: Uint8Array;
} | null {
  const match = hash.match(
    /^#\/share\/([^/]+)\/([^/]+)$/,
  );

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    token: decodeURIComponent(match[1]),
    key: base64UrlToBytes(match[2]),
  };
}