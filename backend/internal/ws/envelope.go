package ws

// Envelope is the wire format exchanged with clients over the WebSocket relay.
// The server is a dumb relay: it never sees plaintext, never derives keys,
// and only routes ciphertext + handshake public keys between the declared
// `from` and `to` participants. Mirrors frontend/src/types.ts#WireEnvelope.
type Envelope struct {
	Type            string `json:"type"` // msg | ack | handshake_init | handshake_ack | presence
	ChatID          string `json:"chatId"`
	From            string `json:"from"`
	To              string `json:"to"`
	Ciphertext      string `json:"ciphertext,omitempty"`
	Nonce           string `json:"nonce,omitempty"`
	SenderPublicKey string `json:"senderPublicKey,omitempty"`
	Ts              int64  `json:"ts"`
}
