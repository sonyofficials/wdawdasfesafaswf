import { useAppStore } from './store';
import { ChatListScreen } from './components/ChatListScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { ChatViewScreen } from './components/ChatViewScreen';
import { IslandNav } from './components/IslandNav';
import { AuthScreen } from './components/AuthScreen';
import './styles/App.css';

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const authToken = useAppStore((s) => s.authToken);
  const setAuth = useAppStore((s) => s.setAuth);

  if (!authToken) {
    return (
      <div className="device">
        <AuthScreen onAuthenticated={setAuth} />
      </div>
    );
  }

  return (
    <div className="device">
      {screen === 'list' && <ChatListScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'chat' && <ChatViewScreen />}
      <IslandNav />
    </div>
  );
}
