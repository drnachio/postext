'use client';

import { useId, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useSandboxLabels, useSandboxSelector } from '../context/SandboxContext';
import { downloadBytes } from '../storage/persistence';
import { Button, IconButton, Select, announce, usePortalContainer, type SelectOption } from '../ui';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/surface';
import { loadLastTemplateId, useWordTemplates } from './sandboxImport';
import { isolate } from './WordImportDialog';
import { emptyTemplate } from './template';
import { postextToDocx } from './toDocx';

type Scope = 'chapter' | 'book';
const AUTO = '__auto__';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface WordExportDialogProps {
  open: boolean;
  onClose: () => void;
  /** File name without extension for the chapter and for the book. */
  chapterFileBase: string;
  bookFileBase: string;
  bookTitle: string;
}

export function WordExportDialog(props: WordExportDialogProps) {
  return (
    <Dialog.Root open={props.open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      {props.open && <WordExportPopup {...props} />}
    </Dialog.Root>
  );
}

function WordExportPopup({ onClose, chapterFileBase, bookFileBase, bookTitle }: WordExportDialogProps) {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const activeMarkdown = useSandboxSelector((s) => s.markdown);
  const container = usePortalContainer();
  const titleId = useId();
  const downloadRef = useRef<HTMLButtonElement>(null);
  const { templates } = useWordTemplates();
  const [scope, setScope] = useState<Scope>(chapters.length > 1 ? 'chapter' : 'book');
  const [templateId, setTemplateId] = useState<string>(() => {
    const last = loadLastTemplateId();
    return last && templates.some((t) => t.id === last) ? last : AUTO;
  });

  const exportDocx = () => {
    const template = templates.find((t) => t.id === templateId) ?? emptyTemplate();
    const list = scope === 'book'
      ? chapters.map((c) => ({ title: c.title, markdown: c.id === activeChapterId ? activeMarkdown : c.markdown }))
      : [{ title: chapters.find((c) => c.id === activeChapterId)?.title ?? '', markdown: activeMarkdown }];
    const bytes = postextToDocx(list, {
      template,
      config,
      book: scope === 'book' && chapters.length > 1,
      title: bookTitle,
      names: { callout: labels.wordStyleCallout, calloutTitle: labels.wordStyleCalloutTitle, chip: labels.wordStyleChip },
    });
    const name = `${scope === 'book' ? bookFileBase : chapterFileBase}.docx`;
    downloadBytes(bytes, name, DOCX_MIME);
    announce(labels.wordExportDone.replace('__file__', isolate(name)));
    onClose();
  };

  const scopeOptions: SelectOption<Scope>[] = [
    { value: 'chapter', label: labels.wordExportScopeChapter },
    { value: 'book', label: labels.wordExportScopeBook },
  ];
  const templateOptions: SelectOption[] = [
    { value: AUTO, label: labels.wordTemplateAuto },
    ...templates.map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="word-export-dialog"
        aria-labelledby={titleId}
        initialFocus={downloadRef}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(480px, calc(100vw - 16px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0' }}>
            {labels.wordExportTitle}
          </Dialog.Title>
          <IconButton label={labels.wordCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
        </div>
        <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
          {labels.wordExportIntro}
        </Dialog.Description>
        {chapters.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs">{labels.wordExportScope}</span>
            <Select<Scope> size="sm" value={scope} onValueChange={setScope} options={scopeOptions} ariaLabel={labels.wordExportScope} />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs">{labels.wordTemplateLabel}</span>
          <Select size="sm" value={templateId} onValueChange={setTemplateId} options={templateOptions} ariaLabel={labels.wordTemplateLabel} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
          <Button ref={downloadRef} variant="primary" size="sm" onClick={exportDocx}>{labels.wordExportAction}</Button>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
