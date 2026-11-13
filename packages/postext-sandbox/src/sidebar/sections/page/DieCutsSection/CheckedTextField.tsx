'use client';

import { useState } from 'react';
import { FieldRow, TextControl } from '../../../../controls/index.js';

interface Props {
  label: string;
  tooltip: string;
  value: string;
  /** Whether a text may be stored: one that may not stays in the box with
   *  `invalidHint` under it, and the stored value stays as it was. */
  valid: (text: string) => boolean;
  invalidHint: string;
  onChange: (text: string) => void;
  placeholder?: string;
  isDefault?: boolean;
  onReset?: () => void;
}

/** A text field whose value is stored only once it reads (SVG path data,
 *  a page list): what is typed stays as typed meanwhile, and a change from
 *  elsewhere (reset, undo) replaces it. The hint says what is wrong
 *  (WCAG 3.3.1). */
export function CheckedTextField({ label, tooltip, value, valid, invalidHint, onChange, placeholder, isDefault, onReset }: Props) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const bad = !valid(draft);
  const type = (text: string) => {
    setDraft(text);
    if (valid(text)) {
      setSeen(text);
      onChange(text);
    }
  };
  return (
    <FieldRow stacked label={label} tooltip={tooltip} isDefault={isDefault ?? false} onReset={onReset}
      hint={bad ? <span role="alert" style={{ color: 'var(--destructive)' }}>{invalidHint}</span> : undefined}>
      <TextControl value={draft} onChange={type} placeholder={placeholder} className="w-full font-mono" />
    </FieldRow>
  );
}
