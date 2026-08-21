import { useAppStore } from '../store';
import '../styles/ChatList.css';

export function ChatListScreen() {
  const chats = useAppStore((s) => s.chats);
  const editing = useAppStore((s) => s.editing);
  const toggleEdit = useAppStore((s) => s.toggleEdit);
  const removeChat = useAppStore((s) => s.removeChat);
  const openChat = useAppStore((s) => s.openChat);

  return (
    <div className="screen" id="screen-list">
      <div className="statusbar" />
      <div className="list-header">
        <button className="edit-btn" onClick={toggleEdit}>
          {editing ? 'Готово' : 'Изменить'}
        </button>
        <h1>Чаты</h1>
        <div className="enc-tag">e2ee active</div>
      </div>
      <div className="search">🔍 Поиск</div>

      <div className={`chat-list${editing ? ' editing' : ''}`}>
        {chats.map((c) => (
          <div
            key={c.id}
            className="chat-item"
            onClick={() => {
              if (!editing) openChat(c.id);
            }}
          >
            <div className="delete-slot">
              <button
                className="delete-x"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChat(c.id);
                }}
              >
                ✕
              </button>
            </div>
            <div
              className={`avatar${c.online ? ' online' : ''}`}
              style={{ background: `linear-gradient(180deg, #ffffff 0%, ${c.color} 100%)` }}
            >
              {c.initials}
            </div>
            <div className="chat-info">
              <div className="chat-row1">
                <div className="chat-name">{c.name}</div>
                <div className="chat-time">{c.time}</div>
              </div>
              <div className="chat-preview">
                {c.enc && <span className="lock">🔒</span>}
                <span>{c.preview}</span>
              </div>
            </div>
            {c.badge > 0 && <div className="badge">{c.badge}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
