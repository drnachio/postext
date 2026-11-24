'use client';

/**
 * The fixes of a frame that does not fit (#868), and of a frame under
 * another or past its edge (#1053, #1066), as buttons: each proposal in
 * the panel's words; a click asks first (the change is to the book's
 * form) and then makes it, one step of the undo history. A shorter text is
 * only selected in the editor, with the number of characters to cut; a
 * move changes the frame's placement offset, or is only told when the
 * frame has none it can shift. A check of
 * another edition offers to open that edition, where its fixes can be
 * made.
 */

import { MoveRight, Wand2 } from 'lucide-react';
import { useDesignDispatch, useSandbox } from '../context/SandboxContext.js';
import { Button, ConfirmPopover, announce } from '../ui/index.js';
import { fill } from '../print/fillTokens.js';
import type { SandboxLabels } from '../types/index.js';
import { setOverlapFocus } from '../editions/overlapFocus.js';
import { frameProposalText, outsideProposalText, type FrameProposal } from './frameOverlapText.js';
import { applyProposalPlan, fixesOf, isFrameFixPayload, planIsAdvice, planProposal, proposalChangesForm, proposalContextOf, valueInWords, type ProposalPlan } from './proposalActions.js';
import type { Warning } from './types.js';

/** The covering frame a fix of `warning` changes (a `frameCovered`'s). */
function coveringFrame(warning: Warning): string {
  return warning.payload.kind === 'frameCovered' ? warning.payload.coveredBy : '';
}

/** A fix in the panel's words, for this warning. */
export function proposalText(proposal: FrameProposal, warning: Warning, labels: SandboxLabels, locale?: string): string {
  // A frame past its edge goes on once held to its room: both, in words.
  if (warning.payload.kind === 'frameOutsideArea') return outsideProposalText(proposal, warning.payload.proposals, labels, locale);
  return frameProposalText(proposal, labels, locale, coveringFrame(warning));
}

/** The question a plan asks before it is carried out. */
export function proposalQuestion(plan: ProposalPlan, warning: Warning, labels: SandboxLabels, locale?: string): string {
  if (plan.kind === 'config') {
    const changes = plan.leaves.map((l, i) => `${plan.settings[i]} = ${valueInWords(l.value, locale)}`).join('; ');
    return fill(labels.proposalConfirmConfig, { changes });
  }
  if (plan.kind === 'text') {
    const from = warning.payload.kind === 'frameOverflow' ? warning.payload.template : '';
    return fill(labels.proposalConfirmTemplate, { template: plan.template, from });
  }
  return '';
}

/** Carry a proposal out now (after the question, or without one for a
 *  selection): what the live region says afterwards. */
export function runProposal(plan: ProposalPlan, warning: Warning, labels: SandboxLabels, dispatch: Parameters<typeof applyProposalPlan>[1], locale?: string): string {
  if (plan.kind === 'stale') return labels.proposalStale;
  applyProposalPlan(plan, dispatch);
  if (plan.kind === 'select') {
    const frame = warning.payload.kind === 'frameOverflow' ? warning.payload.frame : '';
    return fill(labels.proposalSelected, { frame, chars: plan.chars });
  }
  // The overlap the reader was shown is fixed, or moved: not drawn on.
  setOverlapFocus(null);
  return fill(labels.proposalApplied, { change: proposalText(plan.proposal, warning, labels, locale) });
}

export interface ProposalActionsProps {
  warning: Warning;
  /** The check is of the edition on screen: its fixes can be made here.
   *  Otherwise `openEdition` takes the reader to it. */
  onScreen: boolean;
  openEdition?: () => void;
  /** The edition's name, for the button that opens it. */
  editionName?: string;
}

export function ProposalActions({ warning, onScreen, openEdition, editionName }: ProposalActionsProps) {
  const { state } = useSandbox();
  // A fix changes the book's form: written where the Design panel's scope
  // says (#1700).
  const dispatch = useDesignDispatch();
  const { labels } = state;
  const p = warning.payload;
  // The layout's fixes and, for an overlap check, `overlap: 'allow'`.
  const proposals = fixesOf(warning);
  if (!isFrameFixPayload(p) || proposals.length === 0) return null;
  if (!onScreen) {
    return openEdition ? (
      <div className="flex flex-wrap gap-1 px-3 pb-1.5 ps-9" data-proposals="">
        <Button size="xs" variant="ghost" icon={<Wand2 size={12} />} onClick={openEdition} className="h-auto max-w-full shrink whitespace-normal py-0.5 text-start">
          {fill(labels.proposalOtherEdition, { locale: editionName ?? '' })}
        </Button>
      </div>
    ) : null;
  }
  const locale = state.locale;
  const plan = (proposal: FrameProposal) => planProposal(warning, proposal, proposalContextOf(state));
  const run = (proposal: FrameProposal) => announce(runProposal(plan(proposal), warning, labels, dispatch, locale));
  // A frame that does not fit is made to fit; one under another or past its
  // edge is set clear.
  const heading = p.kind === 'frameOverflow' ? labels.proposalsTitle : labels.proposalsOverlapTitle;
  return (
    <div className="flex flex-col gap-0.5 px-3 pb-1.5 ps-9" data-proposals="" role="group" aria-label={fill(heading, { frame: p.frame })}>
      <span className="text-[0.62rem] font-semibold uppercase tracking-[0.04em] text-(--slate)">{fill(heading, { frame: p.frame })}</span>
      <div className="flex flex-wrap gap-1">
        {proposals.map((proposal, i) => {
          const text = proposalText(proposal, warning, labels, locale);
          const planned = proposalChangesForm(proposal) ? plan(proposal) : null;
          if (planned && planIsAdvice(planned)) {
            // A move: told in words, with how to make it.
            return (
              <p key={i} className="m-0 flex w-full items-start gap-1 text-[0.68rem] text-(--slate)" data-proposal={proposal.kind}>
                <MoveRight size={12} aria-hidden="true" className="mt-0.5 shrink-0 rtl:-scale-x-100" />
                <span>{text}. {labels.proposalMoveHint}</span>
              </p>
            );
          }
          if (!proposalChangesForm(proposal)) {
            return (
              <Button key={i} size="xs" variant="outline" title={labels.proposalSelectHint} onClick={() => run(proposal)} className="h-auto max-w-full shrink whitespace-normal py-0.5 text-start" data-proposal={proposal.kind}>
                {text}
              </Button>
            );
          }
          if (!planned) return null;
          const question = planned.kind === 'stale' ? labels.proposalStale : proposalQuestion(planned, warning, labels, locale);
          return (
            <ConfirmPopover
              key={i}
              message={question}
              confirmLabel={labels.proposalConfirmButton}
              onConfirm={() => run(proposal)}
            >
              {({ open }) => (
                <Button size="xs" variant="primary" icon={<Wand2 size={12} />} title={labels.proposalApplyHint} onClick={open} className="h-auto max-w-full shrink whitespace-normal py-0.5 text-start" data-proposal={proposal.kind}>
                  {text}
                </Button>
              )}
            </ConfirmPopover>
          );
        })}
      </div>
    </div>
  );
}
