/**
 * Dina McReynolds — Frontend API Service
 * Drop this file into: src/services/api.ts
 * 
 * Usage in components:
 *   import { api } from '@/services/api'
 *   await api.inquiry.submit({ name, email, type, message })
 *   await api.newsletter.subscribe({ email, name })
 *   await api.concierge.chat({ message, sessionId })
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data as T;
}

// ── Inquiry / Contact Form ────────────────────────────────────────────────────
export interface InquiryPayload {
  name: string;
  email: string;
  phone?: string;
  type: 'speaking' | 'coaching' | 'experiences' | 'media' | 'partnership' | 'general';
  message: string;
  budget?: string;
  timeline?: string;
}

export interface InquiryResponse {
  success: boolean;
  message: string;
  id: number;
}

// ── Newsletter ────────────────────────────────────────────────────────────────
export interface NewsletterPayload {
  email: string;
  name?: string;
}

// ── AI Concierge ─────────────────────────────────────────────────────────────
export interface ConciergePayload {
  message: string;
  sessionId: string;
}

export interface ConciergeResponse {
  reply: string;
  sessionId: string;
}

// ── API Object ────────────────────────────────────────────────────────────────
export const api = {
  inquiry: {
    submit: (payload: InquiryPayload) =>
      request<InquiryResponse>('/api/inquiry', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  newsletter: {
    subscribe: (payload: NewsletterPayload) =>
      request<{ success: boolean; message: string }>('/api/newsletter', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  concierge: {
    chat: (payload: ConciergePayload) =>
      request<ConciergeResponse>('/api/ai-concierge', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  health: {
    check: () => request<{ status: string }>('/api/health'),
  },
};

// ── Session ID helper (for AI Concierge) ─────────────────────────────────────
export function getOrCreateSessionId(): string {
  const key = 'dina_session_id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}
