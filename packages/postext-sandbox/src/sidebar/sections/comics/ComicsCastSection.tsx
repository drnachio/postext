'use client';

import { memo } from 'react';
import { Plus } from 'lucide-react';
import type { ComicCastMember } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext';
import { CollapsibleSection, ColorPicker, FontPicker, SelectInput } from '../../../controls';
import { Button } from '../../../ui';
import { SearchScope } from '../../search/SearchScope';
import { nextFreeId, removeById, renameById, resetFieldById, sanitizeSpeakerId, setComicsField, upsertById } from './comicsConfig';
import { ComicsCardHeader } from './ComicsCardHeader';
import { builtInBalloonName } from './ComicsBalloonStylesSection';
import { useComics } from './comicsShared';

/** The value the balloon-style menu uses for "the speech balloon" (no
 *  style of the character's own). */
const NO_STYLE = '';

/** Comics → Cast: the characters, by the speaker id their script lines and
 *  the pictures' anchors use, with the balloon style, colours and face
 *  that set each one apart. */
export const ComicsCastSection = memo(function ComicsCastSection() {
  const labels = useSandboxLabels();
  const { raw, resolved, write } = useComics();
  const cast: ComicCastMember[] = raw?.cast ?? [];
  const setList = (next: ComicCastMember[]) => write(setComicsField(raw, 'cast', next));
  const speech = resolved.balloonStyles.find((s) => s.id === 'speech') ?? resolved.balloonStyles[0]!;
  const styleOptions = [
    { value: NO_STYLE, label: labels.comicsCastStyleDefault },
    ...resolved.balloonStyles
      .filter((s) => s.id !== 'caption' && s.id !== 'note' && s.id !== 'sfx')
      .map((s) => ({ value: s.id, label: raw?.balloonStyles?.find((o) => o.id === s.id)?.name || builtInBalloonName(s.id, labels) || s.name })),
  ];

  return (
    <CollapsibleSection
      title={labels.comicsCastSection}
      sectionId="comicsCast"
      hasOverrides={cast.length > 0}
      onReset={() => setList([])}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.comicsCastResetConfirm}
    >
      {cast.length === 0 && <p className="mb-2 text-xs text-(--slate) [text-wrap:pretty]">{labels.comicsCastEmpty}</p>}
      {cast.map((member) => {
        const unset = (field: keyof ComicCastMember) => member[field] === undefined;
        const reset = (field: keyof ComicCastMember) => () => setList(resetFieldById(cast, member.id, field));
        const change = (partial: Partial<ComicCastMember>) => setList(upsertById(cast, member.id, partial));
        const style = resolved.balloonStyles.find((s) => s.id === member.balloonStyle) ?? speech;
        return (
          <SearchScope key={member.id} title={`${member.name ?? ''} ${member.id}`} overridden>
            <div className="mb-3 rounded border border-(--rule) p-2">
              <ComicsCardHeader
                title={member.name || member.id}
                id={member.id}
                sanitizeId={sanitizeSpeakerId}
                otherIds={new Set(cast.filter((c) => c.id !== member.id).map((c) => c.id))}
                idLabel={labels.comicsCastIdLabel}
                idHelp={labels.comicsCastIdHelp}
                idAria={labels.comicsCastIdAria}
                idHint={labels.comicsCastUsageHint.replace('__id__', member.id)}
                idDuplicateHint={labels.comicsCastIdDuplicate}
                onRename={(nextId) => setList(renameById(cast, member.id, nextId))}
                name={member.name}
                nameLabel={labels.comicsCastNameLabel}
                nameHelp={labels.comicsCastNameHelp}
                nameAria={labels.comicsCastNameAria}
                onName={(name) => (name === undefined ? reset('name')() : change({ name }))}
                deleteLabel={labels.comicsCastDelete}
                deleteConfirm={labels.comicsCastDeleteConfirm}
                onRemove={() => setList(removeById(cast, member.id))}
              />
              <SelectInput
                label={labels.comicsCastBalloonStyle}
                tooltip={labels.comicsCastBalloonStyleHelp}
                value={member.balloonStyle ?? NO_STYLE}
                options={styleOptions}
                onChange={(v) => (v === NO_STYLE ? reset('balloonStyle')() : change({ balloonStyle: v }))}
                isDefault={unset('balloonStyle')}
                onReset={reset('balloonStyle')}
              />
              <ColorPicker
                label={labels.comicsCastColor}
                tooltip={labels.comicsCastColorHelp}
                value={member.color ?? style.color ?? resolved.lettering.color}
                onChange={(v) => change({ color: v })}
                isDefault={unset('color')}
                onReset={reset('color')}
                fieldId={`comics-cast-${member.id}-color`}
              />
              <ColorPicker
                label={labels.comicsCastFill}
                tooltip={labels.comicsCastFillHelp}
                value={member.fill ?? style.fill}
                onChange={(v) => change({ fill: v })}
                isDefault={unset('fill')}
                onReset={reset('fill')}
                fieldId={`comics-cast-${member.id}-fill`}
              />
              <FontPicker
                label={labels.fontLabel}
                tooltip={labels.comicsCastFontHelp}
                value={member.fontFamily ?? style.fontFamily ?? resolved.lettering.fontFamily}
                onChange={(v) => change({ fontFamily: v })}
                isDefault={unset('fontFamily')}
                onReset={reset('fontFamily')}
                searchPlaceholder={labels.bodyFontSearch}
                noResultsLabel={labels.bodyFontNoResults}
              />
            </div>
          </SearchScope>
        );
      })}
      <Button
        variant="outline"
        size="xs"
        icon={<Plus size={12} />}
        onClick={() => setList([...cast, { id: nextFreeId('speaker', cast.map((c) => c.id)) }])}
        className="mt-1"
      >
        {labels.comicsCastAdd}
      </Button>
    </CollapsibleSection>
  );
});
