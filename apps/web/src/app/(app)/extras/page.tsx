'use client';
// Extras: the small things the office builds for ONE church (a named event
// page, a link to a side tool, a special workflow). The list comes from
// settings.customFeatures via GET /auth/me, so a church only ever sees its own.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSession } from '../../../lib/session';
import type { CustomFeature } from '../../../lib/access';

export default function ExtrasPage() {
  const [extras, setExtras] = useState<CustomFeature[] | null>(null);

  useEffect(() => {
    void getSession()
      .then((me) => setExtras(me.extras ?? []))
      .catch(() => setExtras([]));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>Extras</h1>
          <p className="muted" style={{ margin: 0 }}>
            Tools we set up for your church.
          </p>
        </div>
      </div>

      {extras === null ? <p className="muted">Loading…</p> : null}

      {extras !== null && extras.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing extra has been set up yet. If you need something made for your church, write to support and we
            will add it here.
          </p>
        </div>
      ) : null}

      {extras && extras.length > 0 ? (
        <div className="grid cols-2">
          {extras.map((feature) => (
            <div className="card stack" key={feature.key}>
              <h2 style={{ margin: 0 }}>{feature.label}</h2>
              {feature.description ? <p className="muted" style={{ margin: 0 }}>{feature.description}</p> : null}
              {feature.href?.startsWith('http') ? (
                <a href={feature.href} target="_blank" rel="noreferrer">
                  Open <span aria-hidden>↗</span>
                </a>
              ) : feature.href ? (
                <Link href={feature.href}>Open</Link>
              ) : (
                <span className="badge ok">Set up for you</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
