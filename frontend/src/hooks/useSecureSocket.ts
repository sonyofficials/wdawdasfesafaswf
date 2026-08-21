import { useEffect, useRef, useState } from 'react';
import { SecureSocket } from '../crypto/wsClient';
import { useAppStore } from '../store';

const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/**
 * Owns a SecureSocket for the given chat's peer, drives handshake state,
 * and feeds decrypted incoming messages into the app store.
 *
 * Identity is no longer client-asserted: the WebSocket connection carries
 * the session token issued at login/register, and the Go relay resolves
 * the real userId server-side by validating that token (see
 * backend/internal/ws/handler.go — TokenValidator). A client can no longer
 * claim to be an arbitrary userId via a query param.
 */
export function useSecureSocket(chatId: string | null) {
  const socketRef = useRef<SecureSocket | null>(null);
  const [ready, setReady] = useState(false);
  const [handshakeDone, setHandshakeDone] = useState(false);
  const addMessage = useAppStore((s) => s.addMessage);
  const authToken = useAppStore((s) => s.authToken);
  const userId = useAppStore((s) => s.userId);

  useEffect(() => {
    if (!chatId || !authToken || userId === null) return;
    let cancelled = false;

    const socket = new SecureSocket(String(userId), (incomingChatId, plaintext) => {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      addMessage(incomingChatId, {
        id: crypto.randomUUID(),
        chatId: incomingChatId,
        direction: 'in',
        kind: 'text',
        text: plaintext,
        time,
        delivered: true,
      });
    });
    socketRef.current = socket;

    const wsUrl = `${WS_BASE}?token=${encodeURIComponent(authToken)}`;

    socket
      .connect(wsUrl)
      .then(async () => {
        if (cancelled) return;
        setReady(true);
        await socket.startHandshake(chatId, chatId /* peer id == chat id in this skeleton */);
        // poll for handshake completion — replaced by an event in a fuller build
        const poll = setInterval(() => {
          if (socket.hasSession(chatId)) {
            setHandshakeDone(true);
            clearInterval(poll);
          }
        }, 150);
        setTimeout(() => clearInterval(poll), 5000);
      })
      .catch((err) => {
        console.warn('relay unavailable or session rejected, chat runs in local-only demo mode', err);
      });

    return () => {
      cancelled = true;
      socket.close();
      setReady(false);
      setHandshakeDone(false);
    };
  }, [chatId, authToken, userId, addMessage]);

  const sendPlaintext = async (text: string) => {
    if (!chatId || !socketRef.current) return;
    await socketRef.current.sendMessage(chatId, chatId, text);
  };

  return { socket: socketRef.current, ready, handshakeDone, sendPlaintext };
}
