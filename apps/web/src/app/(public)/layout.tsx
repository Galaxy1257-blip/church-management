import Link from 'next/link';
import './public.css';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pub-shell">
      <header className="pub-top">
        <Link href="/" className="pub-mark">
          <i>C</i> ChMS <span className="pub-tag">for churches</span>
        </Link>
        <nav className="pub-links">
          <Link href="/#features">What it does</Link>
          <Link href="/#pricing">Price</Link>
          <Link href="/#help">Help</Link>
        </nav>
        <div className="pub-cta">
          <Link href="/login" className="link">
            Sign in
          </Link>
          <Link href="/signup" className="pub-btn small">
            Start free trial
          </Link>
        </div>
      </header>
      <main className="pub-main">{children}</main>
      <footer className="pub-foot" id="help">
        <div className="pub-foot-inner">
          <div>
            <b>ChMS</b> · church management for Ghana
          </div>
          <div>
            <b>OmniLabs Studios Pty</b>
            <br />
            <a href="mailto:app.omnilabs.dev@gmail.com">app.omnilabs.dev@gmail.com</a> · a real person answers
          </div>
        </div>
      </footer>
    </div>
  );
}
