import { create } from 'zustand';
import type { Chat, Message } from './types';

type Screen = 'list' | 'settings' | 'chat';

interface AppState {
  screen: Screen;
  activeChatId: string | null;
  editing: boolean;
  chats: Chat[];
  messages: Record<string, Message[]>; // chatId -> messages

  authToken: string | null;
  userId: number | null;
  username: string | null;

  setScreen: (s: Screen) => void;
  openChat: (chatId: string) => void;
  leaveChat: () => void;
  toggleEdit: () => void;
  removeChat: (chatId: string) => void;
  addMessage: (chatId: string, msg: Message) => void;
  setAuth: (token: string, userId: number, username: string) => void;
  logout: () => void;
}

const seedChats: Chat[] = [
  { id: 'anna', name: 'Анна Нефедова', initials: 'АН', color: '#6B7684', online: true, preview: 'ок, жду 🤝 напиши как посмотришь', time: '14:08', badge: 0, enc: true },
  { id: 'dmitry', name: 'Дмитрий К.', initials: 'ДК', color: '#3DD68C', online: false, preview: 'файл: passport_scan.jpg', time: '12:41', badge: 2, enc: true },
  { id: 'work', name: 'Рабочий канал', initials: 'РК', color: '#C4453D', online: true, preview: 'голосовое сообщение · 0:32', time: '11:15', badge: 0, enc: true },
  { id: 'maria', name: 'Мария', initials: 'М', color: '#4A6FA5', online: false, preview: 'перезвони, как будет время', time: 'вчера', badge: 0, enc: true },
  { id: 'igor', name: 'Игорь Петров', initials: 'ИП', color: '#8B5CF6', online: false, preview: 'спасибо, всё получил', time: 'вчера', badge: 0, enc: true },
];

const seedMessages: Record<string, Message[]> = {
  anna: [
    { id: 'm1', chatId: 'anna', direction: 'in', kind: 'text', text: 'привет! скинула тебе документы, глянь как будет минутка', time: '14:02', delivered: true },
    { id: 'm2', chatId: 'anna', direction: 'in', kind: 'file', fileName: 'contract_final.pdf', fileSize: '2.4 MB · зашифровано', time: '14:02', delivered: true },
    { id: 'm3', chatId: 'anna', direction: 'out', kind: 'text', text: 'принял, вечером посмотрю', time: '14:05', delivered: true },
    { id: 'm4', chatId: 'anna', direction: 'out', kind: 'voice', voiceDuration: '0:14', time: '14:07', delivered: true },
    { id: 'm5', chatId: 'anna', direction: 'in', kind: 'text', text: 'ок, жду 🤝 напиши как посмотришь', time: '14:08', delivered: true },
  ],
};

export const useAppStore = create<AppState>((set) => ({
  screen: 'list',
  activeChatId: null,
  editing: false,
  chats: seedChats,
  messages: seedMessages,

  authToken: sessionStorage.getItem('pluton_token'),
  userId: sessionStorage.getItem('pluton_user_id') ? Number(sessionStorage.getItem('pluton_user_id')) : null,
  username: sessionStorage.getItem('pluton_username'),

  setScreen: (s) => set({ screen: s }),

  openChat: (chatId) => set({ screen: 'chat', activeChatId: chatId }),

  leaveChat: () => set({ screen: 'list', activeChatId: null }),

  toggleEdit: () => set((state) => ({ editing: !state.editing })),

  removeChat: (chatId) =>
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
    })),

  addMessage: (chatId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: [...(state.messages[chatId] ?? []), msg],
      },
    })),

  setAuth: (token, userId, username) => {
    sessionStorage.setItem('pluton_token', token);
    sessionStorage.setItem('pluton_user_id', String(userId));
    sessionStorage.setItem('pluton_username', username);
    set({ authToken: token, userId, username });
  },

  logout: () => {
    sessionStorage.removeItem('pluton_token');
    sessionStorage.removeItem('pluton_user_id');
    sessionStorage.removeItem('pluton_username');
    set({ authToken: null, userId: null, username: null, screen: 'list', activeChatId: null });
  },
}));
