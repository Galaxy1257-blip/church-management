'use client';
export default function GiveThanksPage() {
  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: '8vh' }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <h1>Thank you! 🙏</h1>
        <p className="muted">Your gift has been recorded. An SMS receipt is on its way.</p>
        <a href="/give/demo">Give again</a>
      </div>
    </div>
  );
}
