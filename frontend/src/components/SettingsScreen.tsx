import { useState } from 'react';
import { useAppStore } from '../store';
import { logoutUser } from '../api/auth';
import '../styles/Settings.css';

function Toggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return <div className={`toggle${on ? ' on' : ''}`} onClick={() => setOn(!on)} />;
}

export function SettingsScreen() {
  const username = useAppStore((s) => s.username);
  const authToken = useAppStore((s) => s.authToken);
  const logout = useAppStore((s) => s.logout);

  const handleLogout = async () => {
    if (authToken) {
      try {
        await logoutUser(authToken);
      } catch (err) {
        console.warn('logout API call failed, clearing local session anyway', err);
      }
    }
    logout();
  };

  return (
    <div className="screen" id="screen-settings">
      <div className="statusbar" />
      <div className="settings-header">
        <h1>Настройки</h1>
      </div>
      <div className="settings-body">
        <div className="profile-card">
          <div className="avatar" style={{ background: 'linear-gradient(180deg, #ffffff 0%, #3DD68C 100%)' }}>
            {username ? username.slice(0, 2).toUpperCase() : 'ME'}
          </div>
          <div>
            <div className="pname">{username ?? 'Ты'}</div>
            <div className="pkey">pubkey: 7f3a…9c21 · verified</div>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row">
            <div>
              Исчезающие сообщения
              <div className="label-sub">TTL по умолчанию: 24ч</div>
            </div>
            <Toggle initial={true} />
          </div>
          <div className="settings-row">
            <div>
              Скрытые уведомления
              <div className="label-sub">без превью текста</div>
            </div>
            <Toggle initial={true} />
          </div>
          <div className="settings-row">
            <div>Скриншот-блок</div>
            <Toggle initial={false} />
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row">
            <div>
              Резервная копия
              <div className="label-sub">зашифрована локальным ключом</div>
            </div>
            <span style={{ color: 'var(--text-dim)' }}>›</span>
          </div>
          <div className="settings-row">
            <div>
              Устройства
              <div className="label-sub">1 активная сессия</div>
            </div>
            <span style={{ color: 'var(--text-dim)' }}>›</span>
          </div>
          <div className="settings-row">
            <div>.onion зеркало</div>
            <span style={{ color: 'var(--text-dim)' }}>›</span>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row" style={{ color: 'var(--danger)', cursor: 'pointer' }} onClick={handleLogout}>
            Выйти со всех устройств
          </div>
        </div>
      </div>
    </div>
  );
}
