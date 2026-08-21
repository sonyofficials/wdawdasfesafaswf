import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { useSecureSocket } from '../hooks/useSecureSocket';
import '../styles/ChatView.css';

export function ChatViewScreen() {
  const activeChatId = useAppStore((s) => s.activeChatId);
  const chats = useAppStore((s) => s.chats);
  const messages = useAppStore((s) => s.messages);
  const leaveChat = useAppStore((s) => s.leaveChat);
  const addMessage = useAppStore((s) => s.addMessage);

  const chat = chats.find((c) => c.id === activeChatId);
  const chatMessages = activeChatId ? messages[activeChatId] ?? [] : [];

  const [input, setInput] = useState('');
  const [handshaking, setHandshaking] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);
  const { socket, ready, handshakeDone, sendPlaintext } = useSecureSocket(activeChatId);

  useEffect(() => {
    if (!activeChatId) return;
    setHandshaking(true);
    const t = setTimeout(() => setHandshaking(false), 1100);
    return () => clearTimeout(t);
  }, [activeChatId]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [chatMessages.length]);

  if (!chat || !activeChatId) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    addMessage(activeChatId, {
      id: crypto.randomUUID(),
      chatId: activeChatId,
      direction: 'out',
      kind: 'text',
      text,
      time,
      delivered: true,
    });
    setInput('');

    // fire-and-forget over the encrypted socket once handshake completed;
    // falls back to local-only echo (still shown above) if relay unavailable.
    if (ready && handshakeDone) {
      try {
        await sendPlaintext(text);
      } catch (err) {
        console.warn('encrypted send failed, message stayed local-only', err);
      }
    }
  };

  return (
    <div className="screen chat-view" id="screen-chat">
      <div className="statusbar" />

      <div className="chat-topbar">
        <button className="icon-btn" onClick={leaveChat}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="enc-pill">
          {handshakeDone ? 'session: verified' : 'session: handshaking…'}
        </div>
        <div className="peer-meta">
          <div className="peer-name">{chat.name}</div>
          <div className={`peer-status${chat.online ? ' online' : ' offline'}`}>
            <span className="dot" />
            {chat.online ? 'в сети' : 'не в сети'}
          </div>
        </div>
        <div
          className="avatar"
          style={{ background: `linear-gradient(180deg, #ffffff 0%, ${chat.color} 100%)` }}
        >
          {chat.initials}
        </div>
      </div>

      <div className="messages" ref={messagesRef}>
        <div className="day-sep">сегодня</div>
        {chatMessages.map((m) => (
          <div key={m.id} className={`bubble-row ${m.direction}`}>
            <div className="bubble">
              {m.kind === 'text' && m.text}

              {m.kind === 'file' && (
                <div className="file-bubble">
                  <div className="file-ic">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3DD68C" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div>
                    <div className="file-name">{m.fileName}</div>
                    <div className="file-size">{m.fileSize}</div>
                  </div>
                </div>
              )}

              {m.kind === 'voice' && (
                <div className="voice-bubble">
                  <div className="voice-play">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#0B0D10">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                  <VoiceWave />
                  <span style={{ fontFamily: 'var(--sans)', fontSize: 10, opacity: 0.7 }}>{m.voiceDuration}</span>
                </div>
              )}

              <div className="meta">
                {m.time} {m.direction === 'out' && m.delivered && '✓✓'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <button className="icon-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            type="text"
            placeholder="Сообщение..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="icon-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3" />
            </svg>
          </button>
          <button className="icon-btn send-btn" onClick={handleSend}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`handshake${!handshaking ? ' gone' : ''}`}>
        <div className="hk-label">key exchange</div>
        <div className="hk-row">
          <div className="hk-chip">7f3a…9c21</div>
          <span style={{ color: 'var(--accent)' }}>⇄</span>
          <div className="hk-chip">b81e…44f0</div>
        </div>
      </div>
    </div>
  );
}

function VoiceWave() {
  const bars = useRef(Array.from({ length: 22 }, () => 4 + Math.random() * 16));
  return (
    <div className="voice-wave">
      {bars.current.map((h, i) => (
        <span key={i} style={{ height: `${h}px` }} />
      ))}
    </div>
  );
}
