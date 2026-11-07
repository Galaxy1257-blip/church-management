'use client';
// Standalone pages (Bible, share links, give, join) render outside the app
// shell, so on a phone installed as a PWA there is no browser Back button.
// This bar gives one shared way back: history if we came from somewhere,
// otherwise a safe fallback link — never a dead button.
import { useRouter } from 'next/navigation';

export default function BackBar({
  fallbackHref = '/',
  fallbackLabel = 'Home',
}: {
  fallbackHref?: string;
  fallbackLabel?: string;
}) {
  const router = useRouter();
  function goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(fallbackHref);
  }
  return (
    <div className="back-bar">
      <button type="button" className="small secondary" onClick={goBack} aria-label="Go back to the previous page">
        ← Back
      </button>
      <a className="back-bar-home" href={fallbackHref}>{fallbackLabel}</a>
    </div>
  );
}