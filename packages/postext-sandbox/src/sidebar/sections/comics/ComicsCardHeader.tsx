'use client';

import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { FieldRow } from '../../../controls/FieldRow';
import { ConfirmPopover, IconButton } from '../../../ui';
import { inputClass, inputStyle } from './comicsShared';

interface ComicsCardHeaderProps {
  /** Shown as the card's title. */
  title: string;
  id: string;
  /** Turns typed text into a valid id. */
  sanitizeId: (raw: string) => string;
  /** Ids of the other entries of the list (a rename never collides). */
  otherIds: ReadonlySet<string>;
  /** The id cannot change (a built-in balloon style). */
  idLocked?: boolean;
  idLabel: string;
  idHelp: string;
  idAria: string;
  /** Hint under the id field (how the script names this entry). */
  idHint: ReactNode;
  idDuplicateHint: string;
  onRename: (nextId: string) => void;
  name: string | undefined;
  nameLabel: string;
  nameHelp: string;
  nameAria: string;
  onName: (name: string | undefined) => void;
  deleteLabel: string;
  deleteConfirm: string;
  /** Absent: the entry cannot be deleted (a built-in balloon style). */
  onRemove?: () => void;
  /** Drawn between the title row and the id fields (a preview). */
  preview?: ReactNode;
  /** The card is a collapsible section that already shows the title: only
   *  the delete button is drawn (when there is one). */
  hideTitle?: boolean;
}

/** The head of an entry of a comics list (a panel style, a balloon style,
 *  a character): its title and delete button, then its id (renamed on
 *  blur or Enter, never to an id another entry has) and display name. */
export function ComicsCardHeader(props: ComicsCardHeaderProps) {
  const { id, sanitizeId, otherIds } = props;
  const [draft, setDraft] = useState(id);
  const slug = sanitizeId(draft);
  const taken = slug.length > 0 && slug !== id && otherIds.has(slug);
  const empty = slug.length === 0;

  const commit = () => {
    if (empty || taken) {
      setDraft(id);
      return;
    }
    setDraft(slug);
    if (slug !== id) props.onRename(slug);
  };

  return (
    <>
      {(!props.hideTitle || props.onRemove) && (
        <div className={`mb-2 flex min-h-11 items-center gap-1 ${props.hideTitle ? 'justify-end' : 'justify-between'}`}>
          {!props.hideTitle && (
            <span className="truncate text-xs font-medium text-(--foreground)" title={props.title}>
              {props.title}
            </span>
          )}
          {props.onRemove && (
            <ConfirmPopover message={props.deleteConfirm} onConfirm={props.onRemove}>
              {({ open }) => <IconButton label={`${props.deleteLabel}: ${props.title}`} icon={<Trash2 size={13} />} destructive onClick={open} />}
            </ConfirmPopover>
          )}
        </div>
      )}
      {props.preview}
      <div className="mb-2 flex flex-col gap-2">
        <FieldRow
          stacked
          label={props.idLabel}
          tooltip={props.idHelp}
          hint={taken ? props.idDuplicateHint : props.idHint}
          className="mb-0"
        >
          <input
            dir="ltr"
            type="text"
            value={props.idLocked ? id : draft}
            readOnly={props.idLocked}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={props.idLocked ? undefined : commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={props.idAria}
            aria-readonly={props.idLocked || undefined}
            className={inputClass}
            style={{
              ...inputStyle,
              borderColor: empty || taken ? 'var(--destructive)' : 'var(--rule)',
              ...(props.idLocked ? { color: 'var(--slate)' } : {}),
            }}
          />
        </FieldRow>
        <FieldRow stacked label={props.nameLabel} tooltip={props.nameHelp} className="mb-0">
          <input
            dir="auto"
            type="text"
            value={props.name ?? ''}
            onChange={(e) => props.onName(e.target.value.length > 0 ? e.target.value : undefined)}
            aria-label={props.nameAria}
            placeholder={props.title}
            className={inputClass}
            style={inputStyle}
          />
        </FieldRow>
      </div>
    </>
  );
}
