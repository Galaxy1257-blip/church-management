'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface PickedMember {
  id: string;
  firstName: string;
  lastName: string;
  memberNo: string;
}

interface MemberPickerProps {
  value: string;
  onChange: (memberId: string, member?: PickedMember | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  required?: boolean;
}

/**
 * Shared member search-and-pick control so admin forms never ask staff to type
 * raw Member UUIDs. Queries /members?q=... with a short debounce.
 */
export default function MemberPicker({
  value,
  onChange,
  placeholder = 'Search member by name or number…',
  ariaLabel = 'Search member',
  required = false,
}: MemberPickerProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PickedMember | null>(null);
  const [results, setResults] = useState<PickedMember[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      setQuery('');
    }
  }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (selected || q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void api<{ items: PickedMember[] }>(`/members?q=${encodeURIComponent(q)}&pageSize=12`)
        .then((r) => {
          setResults(r.items);
          setOpen(true);
        })
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, selected]);

  if (selected && value === selected.id) {
    return (
      <div className="row" style={{ alignItems: 'center', gap: 6, flex: 1 }}>
        <span className="badge ok" style={{ flex: 1, justifyContent: 'space-between', padding: '0.45rem 0.6rem' }}>
          <span>
            {selected.firstName} {selected.lastName} ({selected.memberNo})
          </span>
        </span>
        <button
          type="button"
          className="small secondary"
          aria-label="Clear selected member"
          onClick={() => {
            setSelected(null);
            setQuery('');
            setResults([]);
            onChange('', null);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={query}
        required={required && !value}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange('', null);
        }}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
      />
      {open && results.length > 0 ? (
        <div
          className="card stack"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            zIndex: 30,
            marginTop: 4,
            padding: 4,
            maxHeight: 220,
            overflowY: 'auto',
            gap: 2,
          }}
        >
          {results.map((m) => (
            <button
              key={m.id}
              type="button"
              className="small secondary"
              style={{ justifyContent: 'space-between', textAlign: 'left', width: '100%' }}
              onClick={() => {
                setSelected(m);
                setQuery(`${m.firstName} ${m.lastName}`);
                setOpen(false);
                onChange(m.id, m);
              }}
            >
              <span>{m.firstName} {m.lastName}</span>
              <span className="muted">{m.memberNo}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
