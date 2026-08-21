export interface AuthResponse {
  token: string;
  userId: number;
  username: string;
}

export interface ApiError {
  error: string;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    throw new Error((body as ApiError).error ?? `request failed with status ${res.status}`);
  }
  return body as T;
}

export interface RegisterPayload {
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password: string;
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse<AuthResponse>(res);
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse<AuthResponse>(res);
}

export async function logoutUser(token: string): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}
