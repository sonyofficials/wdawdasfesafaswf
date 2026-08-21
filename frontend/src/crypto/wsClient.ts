import type { WireEnvelope } from '../types';
import {
  generateIdentityKeyPair,
  exportPublicKey,
  importPeerPublicKey,
  deriveSessionKey,
  encryptMessage,
  decryptMessage,
  type IdentityKeyPair,
} from './session';

type IncomingHandler = (chatId: string, plaintext: string) => void;

export class SecureSocket {
  private ws: WebSocket | null = null;
  private identity: IdentityKeyPair | null = null;
  private sessionKeys = new Map<string, CryptoKey>(); // chatId -> derived AES key
  private onMessage: IncomingHandler;
  readonly userId: string;

  constructor(userId: string, onMessage: IncomingHandler) {
    this.userId = userId;
    this.onMessage = onMessage;
  }

  async connect(url: string) {
    this.identity = await generateIdentityKeyPair();
    this.ws = new WebSocket(url);

    this.ws.onmessage = async (evt) => {
      const envelope: WireEnvelope = JSON.parse(evt.data);
      await this.handleEnvelope(envelope);
    };

    return new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error('socket not created'));
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  /** Kick off X25519(P-256)/ECDH handshake with a peer for a given chat. */
  async startHandshake(chatId: string, peerId: string) {
    if (!this.identity) throw new Error('identity not initialized');
    const pubKeyB64 = await exportPublicKey(this.identity.publicKey);
    this.send({
      type: 'handshake_init',
      chatId,
      from: this.userId,
      to: peerId,
      senderPublicKey: pubKeyB64,
      ts: Date.now(),
    });
  }

  async sendMessage(chatId: string, peerId: string, plaintext: string) {
    const key = this.sessionKeys.get(chatId);
    if (!key) throw new Error(`no session key for chat ${chatId} — handshake not complete`);
    const { ciphertext, nonce } = await encryptMessage(key, plaintext);
    this.send({
      type: 'msg',
      chatId,
      from: this.userId,
      to: peerId,
      ciphertext,
      nonce,
      ts: Date.now(),
    });
  }

  hasSession(chatId: string): boolean {
    return this.sessionKeys.has(chatId);
  }

  private async handleEnvelope(env: WireEnvelope) {
    if (!this.identity) return;

    switch (env.type) {
      case 'handshake_init': {
        if (!env.senderPublicKey) return;
        const peerKey = await importPeerPublicKey(env.senderPublicKey);
        const sessionKey = await deriveSessionKey(this.identity.privateKey, peerKey);
        this.sessionKeys.set(env.chatId, sessionKey);

        // reply so the initiator can derive the same key on their side
        const ourPub = await exportPublicKey(this.identity.publicKey);
        this.send({
          type: 'handshake_ack',
          chatId: env.chatId,
          from: this.userId,
          to: env.from,
          senderPublicKey: ourPub,
          ts: Date.now(),
        });
        break;
      }
      case 'handshake_ack': {
        if (!env.senderPublicKey) return;
        const peerKey = await importPeerPublicKey(env.senderPublicKey);
        const sessionKey = await deriveSessionKey(this.identity.privateKey, peerKey);
        this.sessionKeys.set(env.chatId, sessionKey);
        break;
      }
      case 'msg': {
        const key = this.sessionKeys.get(env.chatId);
        if (!key || !env.ciphertext || !env.nonce) return;
        const plaintext = await decryptMessage(key, { ciphertext: env.ciphertext, nonce: env.nonce });
        this.onMessage(env.chatId, plaintext);
        break;
      }
    }
  }

  private send(env: WireEnvelope) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('socket not open, dropping envelope', env.type);
      return;
    }
    this.ws.send(JSON.stringify(env));
  }

  close() {
    this.ws?.close();
  }
}
