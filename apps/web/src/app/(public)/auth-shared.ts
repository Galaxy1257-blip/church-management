'use client';
// Shared plumbing for the public auth screens: church lookup for the branding
// preview, and the post-sign-in route (staff go to the dashboard, members to
// the portal).
import { useEffect, useState } from 'react';
import type { useRouter } from 'next/navigation';
import { api, setTokens } from '../../lib/api';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export interface PublicChurch {
  name: string;
  pastorDisplayName?: string | null;
  branding?: { logoDataUrl?: string | null; tagline?: string | null; primaryColor?: string | null } | null;
}

/** Debounced /public/:slug lookup so the sign-in card can show the church. */
export function useChurchLookup(slug: string): PublicChurch | null {
  const [church, setChurch] = useState<PublicChurch | null>(null);
  useEffect(() => {
    const s = slug.trim().toLowerCase();
    if (!s) {
      setChurch(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api<PublicChurch>(`/public/${encodeURIComponent(s)}`)
        .then((c) => {
          if (alive) setChurch(c);
        })
        .catch(() => {
          if (alive) setChurch(null);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [slug]);
  return church;
}

export async function finishLogin(router: ReturnType<typeof useRouter>, tokens: Tokens): Promise<void> {
  setTokens(tokens);
  try {
    const me = await api<{ permissions: string[] }>('/auth/me');
    router.replace(me.permissions.length > 0 ? '/dashboard' : '/portal');
  } catch {
    router.replace('/dashboard');
  }
}
