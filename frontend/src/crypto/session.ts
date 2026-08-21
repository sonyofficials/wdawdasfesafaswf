/**
 * Session crypto layer.
 *
 * Current scope (per operator: "базовая крипта сообщений"):
 *   1. Generate an X25519 identity keypair per client (WebCrypto ECDH, curve X25519
 *      is not natively supported by all browsers yet, so we use P-256 ECDH here —
 *      the standard, universally-supported WebCrypto curve — as the base agreement
 *      primitive. Swapping to X25519 via a WASM libsignal binding is the next step,
 *      see README "Next" section).
 *   2. Derive a shared secret via ECDH once both public keys are exchanged.
 *   3. Run HKDF-SHA256 over the shared secret to derive a 256-bit AES-GCM key.
 *   4. Encrypt/decrypt every message with AES-256-GCM, fresh random nonce per message.
 *
 * This gives real confidentiality end-to-end (server only ever sees ciphertext),
 * but it is a static per-session key, not yet a ratcheting protocol — no forward
 * secrecy per-message and no post-compromise recovery. Double Ratchet (Signal
 * Protocol) is the documented next increment, not implemented in this skeleton.
 */

const ECDH_PARAMS: EcKeyAlgorithm = { name: 'ECDH', namedCurve: 'P-256' };

export interface IdentityKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey', 'deriveBits']);
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToBase64(raw);
}

export async function importPeerPublicKey(base64: string): Promise<CryptoKey> {
  const raw = base64ToBuffer(base64);
  return crypto.subtle.importKey('raw', raw, ECDH_PARAMS, true, []);
}

/**
 * Derives a session AES-GCM key from our private key + peer's public key.
 * Both sides run this after the handshake exchange and arrive at the same key
 * without ever transmitting it.
 */
export async function deriveSessionKey(
  ourPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    ourPrivateKey,
    256,
  );

  // HKDF over the raw ECDH output to get a uniformly-random AES key,
  // rather than using ECDH output directly as a key.
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // static salt: acceptable for a single-session key;
      // a per-conversation salt is the natural upgrade alongside ratcheting.
      info: new TextEncoder().encode('secure-messenger session key v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedPayload {
  ciphertext: string; // base64
  nonce: string; // base64
}

export async function encryptMessage(sessionKey: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, sessionKey, encoded);
  return {
    ciphertext: bufferToBase64(ciphertextBuf),
    nonce: bufferToBase64(nonce.buffer),
  };
}

export async function decryptMessage(sessionKey: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const ciphertext = base64ToBuffer(payload.ciphertext);
  const nonce = base64ToBuffer(payload.nonce);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, sessionKey, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

// -- base64 helpers --

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
