export interface Chat {
  id: string;
  name: string;
  initials: string;
  color: string;
  online: boolean;
  preview: string;
  time: string;
  badge: number;
  enc: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  direction: 'in' | 'out';
  kind: 'text' | 'file' | 'voice';
  text?: string;
  fileName?: string;
  fileSize?: string;
  voiceDuration?: string;
  time: string;
  delivered: boolean;
}

// Wire format sent/received over the WebSocket relay.
// `ciphertext` / `nonce` are base64. The server never sees plaintext.
export interface WireEnvelope {
  type: 'msg' | 'ack' | 'handshake_init' | 'handshake_ack' | 'presence';
  chatId: string;
  from: string;
  to: string;
  ciphertext?: string;
  nonce?: string;
  senderPublicKey?: string; // base64 X25519 pubkey, used during handshake
  ts: number;
}
