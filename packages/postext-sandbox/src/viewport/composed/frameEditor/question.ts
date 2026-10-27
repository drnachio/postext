// The question a frame drop asks when other pages use the template: write
// it on the template or on this page (#1276: split out of frameEditor.ts).
import type { VDTFrame, VDTPage } from 'postext';
import type { Rect } from '../../../templates/frameGeometry.js';
import { flowBoxOnSheet } from '../frameHit.js';
import type { FrameEditorRefs } from './shared.js';
import type { FrameEditorState } from './state.js';

/** What createFrameQuestion takes from the frame editor. */
export interface FrameQuestionDeps {
  slot: HTMLElement;
  pageWidthPx: number;
  pageHeightPx: number;
  refs: FrameEditorRefs;
  page: () => VDTPage | undefined;
  paint: () => void;
  frameState: FrameEditorState;
}

export function createFrameQuestion(deps: FrameQuestionDeps) {
  const {
    slot, pageWidthPx, pageHeightPx, refs, page, paint, frameState
  } = deps;
  const closeQuestion = (): void => {
    frameState.question?.remove();
    frameState.question = null;
    if (frameState.pending) {
      frameState.pending = null;
      paint();
    }
  };

  /** Ask where a frame dropped at `to` is written, when other pages use
   *  the template. */
  const ask = (frame: VDTFrame, to: Rect, pages: number, apply: (where: 'template' | 'page') => void): void => {
    const labels = refs.labelsRef?.current;
    if (!labels) {
      apply('template');
      return;
    }
    frameState.pending = to;
    paint();
    frameState.question?.remove();
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', labels.pageTemplatesMoveQuestion.replace('__frame__', frame.name));
    Object.assign(box.style, {
      position: 'absolute', zIndex: '7', maxWidth: '18rem', padding: '0.5rem', borderRadius: '0.5rem',
      background: 'var(--background, #fff)', color: 'var(--foreground, #111)', border: '1px solid var(--rule, #ccc)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)', font: '12px/1.35 system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: '0.35rem',
    } satisfies Partial<CSSStyleDeclaration>);
    const shown = flowBoxOnSheet(page(), to).rect;
    const left = Math.min(Math.max(0, shown.x / pageWidthPx), 0.6) * 100;
    const top = Math.min(Math.max(0, (shown.y + shown.height) / pageHeightPx), 0.8) * 100;
    box.style.left = `${left}%`;
    box.style.top = `${top}%`;
    const text = document.createElement('p');
    text.style.margin = '0';
    text.textContent = labels.pageTemplatesMoveQuestion.replace('__frame__', frame.name);
    box.appendChild(text);
    const button = (label: string, onClick: () => void, primary = false): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        minHeight: '2rem', padding: '0.25rem 0.6rem', borderRadius: '0.375rem', cursor: 'pointer', textAlign: 'start',
        border: `1px solid ${primary ? 'var(--brand, #2f6fd6)' : 'var(--pt-control-border, #bbb)'}`,
        background: 'var(--surface, #f6f6f6)', color: primary ? 'var(--brand, #2f6fd6)' : 'inherit', font: 'inherit',
      } satisfies Partial<CSSStyleDeclaration>);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      box.appendChild(b);
      return b;
    };
    const first = button(labels.pageTemplatesMoveChangeTemplate.replace('__count__', String(pages)), () => {
      closeQuestion();
      apply('template');
    }, true);
    button(labels.pageTemplatesMoveThisPage, () => {
      closeQuestion();
      apply('page');
    });
    button(labels.pageTemplatesMoveCancel, () => closeQuestion());
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeQuestion();
      }
    });
    box.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
    slot.appendChild(box);
    frameState.question = box;
    first.focus({ preventScroll: true });
  };
  return {
    closeQuestion, ask
  };
}
