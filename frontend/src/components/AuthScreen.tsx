import { useState } from 'react';
import { registerUser, loginUser } from '../api/auth';
import '../styles/Auth.css';

type Tab = 'login' | 'register';
type ContactMethod = 'email' | 'phone';

interface AuthScreenProps {
  onAuthenticated: (token: string, userId: number, username: string) => void;
}

function generatePassword(): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_=+';
  const all = lower + upper + digits + symbols;
  const length = 16;

  const randomChar = (charset: string) => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return charset[bytes[0] % charset.length];
  };

  const chars = [randomChar(lower), randomChar(upper), randomChar(digits), randomChar(symbols)];
  for (let i = chars.length; i < length; i++) {
    chars.push(randomChar(all));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function strengthOf(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-ZА-Я]/.test(password) && /[a-zа-я]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-zА-Яа-я0-9]/.test(password)) score++;
  const labels = ['слишком слабый', 'слабый', 'средний', 'надёжный'];
  return { score, label: password.length === 0 ? 'минимум 8 символов' : labels[Math.max(score - 1, 0)] };
}

const STRENGTH_COLORS = ['#C4453D', '#C4453D', '#E8A93D', '#3DD68C'];

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [tab, setTab] = useState<Tab>('login');

  // login state
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginPassVisible, setLoginPassVisible] = useState(false);

  // register state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [contactMethod, setContactMethod] = useState<ContactMethod>('email');
  const [contactValue, setContactValue] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regPass2, setRegPass2] = useState('');
  const [regPassVisible, setRegPassVisible] = useState(false);
  const [generatedHint, setGeneratedHint] = useState(false);

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const strength = strengthOf(regPass);
  const passwordsMismatch = regPass2.length > 0 && regPass !== regPass2;

  const handleGeneratePassword = () => {
    const pw = generatePassword();
    setRegPass(pw);
    setRegPass2(pw);
    setRegPassVisible(true);
    navigator.clipboard?.writeText(pw).catch(() => {});
    setGeneratedHint(true);
    setTimeout(() => setGeneratedHint(false), 3000);
  };

  const handleLogin = async () => {
    setFormError(null);
    if (!loginId.trim() || !loginPass) {
      setFormError('заполни оба поля');
      return;
    }
    setLoading(true);
    try {
      const res = await loginUser({ identifier: loginId.trim(), password: loginPass });
      onAuthenticated(res.token, res.userId, res.username);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setFormError(null);

    if (username.trim().length < 3) {
      setFormError('ник должен быть от 3 символов');
      return;
    }
    if (!contactValue.trim()) {
      setFormError(contactMethod === 'email' ? 'укажи почту' : 'укажи номер телефона');
      return;
    }
    if (regPass.length < 8) {
      setFormError('пароль должен быть от 8 символов');
      return;
    }
    if (regPass !== regPass2) {
      setFormError('пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const res = await registerUser({
        username: username.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: contactMethod === 'email' ? contactValue.trim() : undefined,
        phone: contactMethod === 'phone' ? contactValue.trim() : undefined,
        password: regPass,
      });
      onAuthenticated(res.token, res.userId, res.username);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen" id="screen-auth">
      <div className="statusbar" />

      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h1>Pluton</h1>
        <div className="sub">end-to-end encrypted</div>
      </div>

      <div className="auth-tabs">
        <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setFormError(null); }}>
          Вход
        </button>
        <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setFormError(null); }}>
          Регистрация
        </button>
      </div>

      <div className="form-scroll">
        {formError && <div className="form-level-error">{formError}</div>}

        {tab === 'login' && (
          <div>
            <div className="field">
              <label>Ник, почта или номер</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  type="text"
                  placeholder="username / email / телефон"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
            </div>

            <div className="field">
              <label>Пароль</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  type={loginPassVisible ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
                <button className="icon-action" onClick={() => setLoginPassVisible(!loginPassVisible)}>
                  <EyeIcon />
                </button>
              </div>
            </div>

            <div className="forgot-link">
              <a>Забыли пароль?</a>
            </div>

            <button className="btn-primary" onClick={handleLogin} disabled={loading}>
              {loading ? 'Вход...' : 'Войти'}
            </button>

            <div className="divider">или</div>

            <div className="alt-action">
              Нет аккаунта? <a onClick={() => { setTab('register'); setFormError(null); }}>Создать</a>
            </div>
          </div>
        )}

        {tab === 'register' && (
          <div>
            <div className="name-row">
              <div className="field">
                <label>
                  Имя <span className="optional-tag">(необязательно)</span>
                </label>
                <div className="input-wrap">
                  <input type="text" placeholder="Имя" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>
                  Фамилия <span className="optional-tag">(необязательно)</span>
                </label>
                <div className="input-wrap">
                  <input type="text" placeholder="Фамилия" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="field">
              <label>Ник</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 2-3 4" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <input type="text" placeholder="@username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="field-hint">это твой публичный идентификатор — имя не увидит никто</div>
            </div>

            <div className="field">
              <label>Способ входа</label>
              <div className="contact-switch">
                <button className={contactMethod === 'email' ? 'active' : ''} onClick={() => { setContactMethod('email'); setContactValue(''); }}>
                  Почта
                </button>
                <button className={contactMethod === 'phone' ? 'active' : ''} onClick={() => { setContactMethod('phone'); setContactValue(''); }}>
                  Телефон
                </button>
              </div>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 6l-10 7L2 6" />
                  <path d="M22 6H2v12h20V6z" />
                </svg>
                <input
                  type={contactMethod === 'email' ? 'text' : 'tel'}
                  placeholder={contactMethod === 'email' ? 'you@example.com' : '+7 900 000-00-00'}
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                />
              </div>
              <div className="field-hint">используется только для восстановления доступа</div>
            </div>

            <div className="field">
              <label>Пароль</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  type={regPassVisible ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                />
                <button className="icon-action" onClick={handleGeneratePassword} title="Сгенерировать надёжный пароль">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                </button>
                <button className="icon-action" onClick={() => setRegPassVisible(!regPassVisible)}>
                  <EyeIcon />
                </button>
              </div>
              <div className="strength-bar">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} style={{ background: i < strength.score ? STRENGTH_COLORS[Math.min(strength.score - 1, 3)] : undefined }} />
                ))}
              </div>
              <div className="strength-label">{strength.label}</div>
              {generatedHint && <div className="field-hint">сгенерирован и скопирован в буфер</div>}
            </div>

            <div className="field">
              <label>Повтор пароля</label>
              <div className={`input-wrap${passwordsMismatch ? ' error' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  type={regPassVisible ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={regPass2}
                  onChange={(e) => setRegPass2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                />
              </div>
              {passwordsMismatch && <div className="field-error">пароли не совпадают</div>}
            </div>

            <button className="btn-primary" onClick={handleRegister} disabled={loading}>
              {loading ? 'Создание...' : 'Создать аккаунт'}
            </button>

            <div className="legal-note">
              Регистрируясь, ты соглашаешься с условиями использования.
              <span className="lock-inline"> 🔒</span> Сообщения защищены end-to-end шифрованием — мы физически не можем их прочитать.
            </div>

            <div className="alt-action" style={{ marginTop: 10 }}>
              Уже есть аккаунт? <a onClick={() => { setTab('login'); setFormError(null); }}>Войти</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
