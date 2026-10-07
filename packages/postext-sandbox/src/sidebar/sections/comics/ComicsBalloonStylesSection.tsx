'use client';

import { memo } from 'react';
import { Plus } from 'lucide-react';
import type { BalloonStyleConfig, ComicBalloonPosition, ComicBalloonShape, ComicBalloonTail, ResolvedBalloonStyleConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import { CollapsibleSection, ColorPicker, DimensionInput, FontPicker, NumberInput, SelectInput, ToggleSwitch } from '../../../controls';
import { Button } from '../../../ui';
import type { SandboxLabels } from '../../../types/labels';
import { SearchScope } from '../../search/SearchScope';
import { BalloonPreview } from '../../settings/BalloonPreview';
import {
  isBuiltInBalloonStyle,
  nextFreeId,
  removeById,
  renameById,
  resetFieldById,
  retargetCast,
  setComicsField,
  slugifyStyleId,
  upsertById,
} from './comicsConfig';
import { ComicsCardHeader } from './ComicsCardHeader';
import { BORDER_UNITS, EM_UNITS, useComics } from './comicsShared';

/** The localized name of a built-in balloon style. */
export function builtInBalloonName(id: string, labels: SandboxLabels): string | undefined {
  switch (id) {
    case 'speech': return labels.comicsBalloonSpeech;
    case 'thought': return labels.comicsBalloonThought;
    case 'whisper': return labels.comicsBalloonWhisper;
    case 'shout': return labels.comicsBalloonShout;
    case 'radio': return labels.comicsBalloonRadio;
    case 'caption': return labels.comicsBalloonCaption;
    case 'inner': return labels.comicsBalloonInner;
    case 'note': return labels.comicsBalloonNote;
    case 'sfx': return labels.comicsBalloonSfx;
    default: return undefined;
  }
}

/** What a script line writes to use a style: a flag on a speaker line, or
 *  the reserved key of captions, notes and sound effects. */
function usageHint(id: string, labels: SandboxLabels): string {
  if (id === 'caption' || id === 'note' || id === 'sfx') return labels.comicsBalloonUsageReserved.replace('__id__', id);
  if (id === 'speech') return labels.comicsBalloonUsageSpeech;
  return labels.comicsBalloonUsageHint.replace('__id__', id);
}

interface BalloonCardProps {
  style: ResolvedBalloonStyleConfig;
  /** The config entry of this style, when it has one. */
  own: BalloonStyleConfig | undefined;
  otherIds: ReadonlySet<string>;
  onChange: (partial: Partial<BalloonStyleConfig>) => void;
  onResetField: (field: keyof BalloonStyleConfig) => void;
  onRename: (nextId: string) => void;
  onRestore: () => void;
  onRemove: () => void;
}

function BalloonStyleCard({ style, own, otherIds, onChange, onResetField, onRename, onRestore, onRemove }: BalloonCardProps) {
  const labels = useSandboxLabels();
  const { resolved } = useComics();
  const palette = useSandboxSelector((s) => s.config.colorPalette);
  const builtIn = isBuiltInBalloonStyle(style.id);
  const builtInName = builtInBalloonName(style.id, labels);
  const title = own?.name || builtInName || style.name || style.id;
  const unset = (field: keyof BalloonStyleConfig) => own?.[field] === undefined;
  const reset = (field: keyof BalloonStyleConfig) => () => onResetField(field);
  const lettering = resolved.lettering;
  const sample = style.id === 'sfx' ? labels.comicsBalloonPreviewSfx : style.id === 'caption' || style.id === 'note' ? labels.comicsBalloonPreviewCaption : labels.comicsBalloonPreviewText;
  const hasOwn = own !== undefined && Object.keys(own).some((k) => k !== 'id');
  const prefix = `comics-balloon-${style.id}`;

  return (
    <SearchScope title={`${title} ${style.id}`} overridden={hasOwn}>
      <CollapsibleSection
        title={title}
        sectionId={`comicsBalloonStyles.${style.id}`}
        hasOverrides={builtIn && hasOwn}
        onReset={builtIn ? onRestore : undefined}
        resetLabel={labels.comicsBalloonRestore}
        resetConfirmMessage={labels.comicsBalloonRestoreConfirm}
      >
        <ComicsCardHeader
          title={title}
          id={style.id}
          sanitizeId={slugifyStyleId}
          otherIds={otherIds}
          idLocked={builtIn}
          idLabel={labels.idLabel}
          idHelp={labels.comicsBalloonIdHelp}
          idAria={labels.comicsBalloonIdAria}
          idHint={usageHint(style.id, labels)}
          idDuplicateHint={labels.comicsStyleIdDuplicate}
          onRename={onRename}
          name={own?.name}
          nameLabel={labels.comicsStyleNameLabel}
          nameHelp={labels.styleNameHelp}
          nameAria={labels.comicsBalloonNameAria}
          onName={(name) => (name === undefined ? onResetField('name') : onChange({ name }))}
          deleteLabel={labels.comicsStyleDelete}
          deleteConfirm={labels.comicsBalloonDeleteConfirm}
          onRemove={builtIn ? undefined : onRemove}
          hideTitle
          preview={
            <BalloonPreview
              style={style}
              lettering={lettering}
              palette={palette}
              text={sample}
              label={labels.comicsBalloonPreviewAria.replace('__style__', title)}
            />
          }
        />

        <CollapsibleSection title={labels.comicsBalloonGroupOutline} sectionId={`${prefix}.outline`} variant="subsection">
          <SelectInput
            label={labels.comicsBalloonShape}
            tooltip={labels.comicsBalloonShapeHelp}
            value={style.shape}
            options={[
              { value: 'oval', label: labels.comicsShapeOval },
              { value: 'rounded', label: labels.comicsShapeRounded },
              { value: 'rectangle', label: labels.comicsShapeRectangle },
              { value: 'cloud', label: labels.comicsShapeCloud, description: labels.comicsShapeCloudDescription },
              { value: 'burst', label: labels.comicsShapeBurst, description: labels.comicsShapeBurstDescription },
              { value: 'wavy', label: labels.comicsShapeWavy, description: labels.comicsShapeWavyDescription },
              { value: 'electric', label: labels.comicsShapeElectric, description: labels.comicsShapeElectricDescription },
              { value: 'none', label: labels.comicsShapeNone, description: labels.comicsShapeNoneDescription },
            ]}
            onChange={(v) => onChange({ shape: v as ComicBalloonShape })}
            isDefault={unset('shape')}
            onReset={reset('shape')}
          />
          {style.shape !== 'none' && (
            <>
              <ColorPicker label={labels.comicsBalloonFill} value={style.fill} onChange={(v) => onChange({ fill: v })} isDefault={unset('fill')} onReset={reset('fill')} fieldId={`${prefix}-fill`} />
              <ColorPicker label={labels.comicsBalloonStroke} value={style.stroke} onChange={(v) => onChange({ stroke: v })} isDefault={unset('stroke')} onReset={reset('stroke')} fieldId={`${prefix}-stroke`} />
              <DimensionInput
                label={labels.comicsBalloonStrokeWidth}
                value={style.strokeWidth}
                onChange={(v) => onChange({ strokeWidth: v })}
                min={0}
                step={0.1}
                units={BORDER_UNITS}
                isDefault={unset('strokeWidth')}
                onReset={reset('strokeWidth')}
              />
              <ToggleSwitch label={labels.comicsBalloonDash} tooltip={labels.comicsBalloonDashHelp} checked={style.dash} onChange={(v) => onChange({ dash: v })} isDefault={unset('dash')} onReset={reset('dash')} />
              <ToggleSwitch label={labels.comicsBalloonDouble} tooltip={labels.comicsBalloonDoubleHelp} checked={style.double} onChange={(v) => onChange({ double: v })} isDefault={unset('double')} onReset={reset('double')} />
              <NumberInput
                label={labels.comicsBalloonWobble}
                tooltip={labels.comicsBalloonWobbleHelp}
                value={style.wobble}
                onChange={(v) => onChange({ wobble: v })}
                min={0}
                max={1}
                step={0.05}
                isDefault={unset('wobble')}
                onReset={reset('wobble')}
              />
              {style.shape === 'oval' && (
                <NumberInput
                  label={labels.comicsBalloonRoundness}
                  tooltip={labels.comicsBalloonRoundnessHelp}
                  value={style.roundness}
                  onChange={(v) => onChange({ roundness: v })}
                  min={1.5}
                  max={6}
                  step={0.1}
                  isDefault={unset('roundness')}
                  onReset={reset('roundness')}
                />
              )}
              {style.shape === 'burst' && (
                <>
                  <NumberInput
                    label={labels.comicsBalloonBurstPoints}
                    value={style.burstPoints}
                    onChange={(v) => onChange({ burstPoints: Math.round(v) })}
                    min={5}
                    max={40}
                    step={1}
                    isDefault={unset('burstPoints')}
                    onReset={reset('burstPoints')}
                  />
                  <NumberInput
                    label={labels.comicsBalloonBurstDepth}
                    tooltip={labels.comicsBalloonBurstDepthHelp}
                    value={style.burstDepth}
                    onChange={(v) => onChange({ burstDepth: v })}
                    min={0.05}
                    max={0.8}
                    step={0.01}
                    isDefault={unset('burstDepth')}
                    onReset={reset('burstDepth')}
                  />
                </>
              )}
            </>
          )}
          <DimensionInput
            label={labels.comicsBalloonPadding}
            tooltip={labels.comicsBalloonPaddingHelp}
            value={style.padding}
            onChange={(v) => onChange({ padding: v })}
            min={0}
            step={0.05}
            units={EM_UNITS}
            isDefault={unset('padding')}
            onReset={reset('padding')}
          />
          <NumberInput
            label={labels.comicsBalloonAspect}
            tooltip={labels.comicsBalloonAspectHelp}
            value={style.aspect}
            onChange={(v) => onChange({ aspect: v })}
            min={0.3}
            max={8}
            step={0.1}
            isDefault={unset('aspect')}
            onReset={reset('aspect')}
          />
        </CollapsibleSection>

        {style.shape !== 'none' && (
          <CollapsibleSection title={labels.comicsBalloonGroupTail} sectionId={`${prefix}.tail`} variant="subsection">
            <SelectInput
              label={labels.comicsBalloonTail}
              tooltip={labels.comicsBalloonTailHelp}
              value={style.tail}
              options={[
                { value: 'curved', label: labels.comicsTailCurved },
                { value: 'wedge', label: labels.comicsTailWedge },
                { value: 'bubbles', label: labels.comicsTailBubbles, description: labels.comicsTailBubblesDescription },
                { value: 'zigzag', label: labels.comicsTailZigzag, description: labels.comicsTailZigzagDescription },
                { value: 'none', label: labels.comicsTailNone },
              ]}
              onChange={(v) => onChange({ tail: v as ComicBalloonTail })}
              isDefault={unset('tail')}
              onReset={reset('tail')}
            />
            {style.tail !== 'none' && (
              <>
                <DimensionInput
                  label={labels.comicsBalloonTailWidth}
                  tooltip={labels.comicsBalloonTailWidthHelp}
                  value={style.tailWidth}
                  onChange={(v) => onChange({ tailWidth: v })}
                  min={0}
                  step={0.05}
                  units={EM_UNITS}
                  isDefault={unset('tailWidth')}
                  onReset={reset('tailWidth')}
                />
                <NumberInput
                  label={labels.comicsBalloonTailReach}
                  tooltip={labels.comicsBalloonTailReachHelp}
                  value={style.tailReach}
                  onChange={(v) => onChange({ tailReach: v })}
                  min={0.1}
                  max={1}
                  step={0.05}
                  isDefault={unset('tailReach')}
                  onReset={reset('tailReach')}
                />
                <SelectInput
                  label={labels.comicsBalloonTarget}
                  tooltip={labels.comicsBalloonTargetHelp}
                  value={style.target}
                  options={[
                    { value: 'mouth', label: labels.comicsTargetMouth },
                    { value: 'head', label: labels.comicsTargetHead },
                  ]}
                  onChange={(v) => onChange({ target: v as BalloonStyleConfig['target'] })}
                  variant="segmented"
                  isDefault={unset('target')}
                  onReset={reset('target')}
                />
              </>
            )}
          </CollapsibleSection>
        )}

        <CollapsibleSection title={labels.comicsBalloonGroupPlacement} sectionId={`${prefix}.placement`} variant="subsection">
          <SelectInput
            label={labels.comicsBalloonPosition}
            tooltip={labels.comicsBalloonPositionHelp}
            value={style.position}
            options={[
              { value: 'auto', label: labels.comicsPositionAuto },
              { value: 'top-start', label: labels.comicsPositionTopStart },
              { value: 'top', label: labels.comicsPositionTop },
              { value: 'top-end', label: labels.comicsPositionTopEnd },
              { value: 'bottom-start', label: labels.comicsPositionBottomStart },
              { value: 'bottom', label: labels.comicsPositionBottom },
              { value: 'bottom-end', label: labels.comicsPositionBottomEnd },
            ]}
            onChange={(v) => onChange({ position: v as ComicBalloonPosition })}
            isDefault={unset('position')}
            onReset={reset('position')}
          />
          <ToggleSwitch label={labels.comicsBalloonButt} tooltip={labels.comicsBalloonButtHelp} checked={style.butt} onChange={(v) => onChange({ butt: v })} isDefault={unset('butt')} onReset={reset('butt')} />
          <NumberInput
            label={labels.comicsBalloonRotate}
            tooltip={labels.comicsBalloonRotateHelp}
            value={style.rotate}
            onChange={(v) => onChange({ rotate: v })}
            min={-45}
            max={45}
            step={1}
            suffix="°"
            isDefault={unset('rotate')}
            onReset={reset('rotate')}
          />
          <NumberInput
            label={labels.comicsBalloonSkew}
            tooltip={labels.comicsBalloonSkewHelp}
            value={style.skew}
            onChange={(v) => onChange({ skew: v })}
            min={-60}
            max={60}
            step={1}
            suffix="°"
            isDefault={unset('skew')}
            onReset={reset('skew')}
          />
        </CollapsibleSection>

        <CollapsibleSection title={labels.comicsBalloonGroupText} sectionId={`${prefix}.text`} variant="subsection">
          <FontPicker
            label={labels.fontLabel}
            tooltip={labels.comicsBalloonFontHelp}
            value={style.fontFamily ?? lettering.fontFamily}
            onChange={(v) => onChange({ fontFamily: v })}
            isDefault={unset('fontFamily')}
            onReset={reset('fontFamily')}
            searchPlaceholder={labels.bodyFontSearch}
            noResultsLabel={labels.bodyFontNoResults}
          />
          <NumberInput
            label={labels.comicsBalloonFontScale}
            tooltip={labels.comicsBalloonFontScaleHelp}
            value={style.fontScale}
            onChange={(v) => onChange({ fontScale: v })}
            min={0.5}
            max={5}
            step={0.05}
            suffix="×"
            isDefault={unset('fontScale')}
            onReset={reset('fontScale')}
          />
          <ColorPicker
            label={labels.colorLabel}
            tooltip={labels.comicsBalloonColorHelp}
            value={style.color ?? lettering.color}
            onChange={(v) => onChange({ color: v })}
            isDefault={unset('color')}
            onReset={reset('color')}
            fieldId={`${prefix}-color`}
          />
          <ToggleSwitch label={labels.bold} tooltip={labels.boldHelp} checked={style.bold ?? lettering.bold} onChange={(v) => onChange({ bold: v })} isDefault={unset('bold')} onReset={reset('bold')} />
          <ToggleSwitch label={labels.italic} tooltip={labels.italicHelp} checked={style.italic ?? lettering.italic} onChange={(v) => onChange({ italic: v })} isDefault={unset('italic')} onReset={reset('italic')} />
          <SelectInput
            label={labels.comicsTextTransform}
            tooltip={labels.comicsTextTransformHelp}
            value={style.textTransform ?? lettering.textTransform}
            options={[
              { value: 'none', label: labels.comicsTextTransformNone },
              { value: 'uppercase', label: labels.comicsTextTransformUppercase },
            ]}
            onChange={(v) => onChange({ textTransform: v as BalloonStyleConfig['textTransform'] })}
            variant="segmented"
            isDefault={unset('textTransform')}
            onReset={reset('textTransform')}
          />
          <DimensionInput
            label={labels.comicsLetterSpacing}
            tooltip={labels.comicsLetterSpacingHelp}
            value={style.letterSpacing ?? lettering.letterSpacing}
            onChange={(v) => onChange({ letterSpacing: v })}
            min={-0.2}
            step={0.01}
            units={EM_UNITS}
            isDefault={unset('letterSpacing')}
            onReset={reset('letterSpacing')}
          />
          <SelectInput
            label={labels.comicsBalloonAlign}
            value={style.align}
            options={[
              { value: 'center', label: labels.comicsAlignCenter },
              { value: 'start', label: labels.comicsAlignStart },
            ]}
            onChange={(v) => onChange({ align: v as BalloonStyleConfig['align'] })}
            variant="segmented"
            isDefault={unset('align')}
            onReset={reset('align')}
          />
          <DimensionInput
            label={labels.comicsBalloonHalo}
            tooltip={labels.comicsBalloonHaloHelp}
            value={style.halo ?? { value: 0, unit: 'pt' }}
            onChange={(v) => onChange({ halo: v })}
            min={0}
            step={0.25}
            units={BORDER_UNITS}
            isDefault={unset('halo')}
            onReset={reset('halo')}
          />
          {style.halo && style.halo.value > 0 && (
            <ColorPicker
              label={labels.comicsBalloonHaloColor}
              value={style.haloColor ?? { hex: '#ffffff', model: 'hex' }}
              onChange={(v) => onChange({ haloColor: v })}
              isDefault={unset('haloColor')}
              onReset={reset('haloColor')}
              fieldId={`${prefix}-haloColor`}
            />
          )}
        </CollapsibleSection>
      </CollapsibleSection>
    </SearchScope>
  );
}

/** Comics → Balloon styles: the kinds of balloon a script line names
 *  (`ben{whisper}: …`). The built-in kinds are always there and can be
 *  changed or restored; new kinds start from the speech balloon. */
export const ComicsBalloonStylesSection = memo(function ComicsBalloonStylesSection() {
  const labels = useSandboxLabels();
  const { raw, resolved, write } = useComics();
  const own: BalloonStyleConfig[] = raw?.balloonStyles ?? [];
  const setList = (next: BalloonStyleConfig[]) => write(setComicsField(raw, 'balloonStyles', next));
  const ids = resolved.balloonStyles.map((s) => s.id);

  const rename = (id: string, nextId: string) => {
    if (ids.includes(nextId)) return;
    // The characters who speak in the style follow it.
    write(setComicsField(setComicsField(raw, 'balloonStyles', renameById(own, id, nextId)), 'cast', retargetCast(raw?.cast, id, nextId)));
  };
  const remove = (id: string) => {
    write(setComicsField(setComicsField(raw, 'balloonStyles', removeById(own, id)), 'cast', retargetCast(raw?.cast, id, undefined)));
  };

  return (
    <CollapsibleSection
      title={labels.comicsBalloonStylesSection}
      sectionId="comicsBalloonStyles"
      hasOverrides={own.length > 0}
      onReset={() => setList([])}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.comicsBalloonStylesResetConfirm}
    >
      <p className="mb-2 text-[0.66rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">{labels.comicsBalloonStylesIntro}</p>
      {resolved.balloonStyles.map((style) => (
        <BalloonStyleCard
          key={style.id}
          style={style}
          own={own.find((s) => s.id === style.id)}
          otherIds={new Set(ids.filter((id) => id !== style.id))}
          onChange={(partial) => setList(upsertById(own, style.id, partial))}
          onResetField={(field) => setList(resetFieldById(own, style.id, field, isBuiltInBalloonStyle(style.id)))}
          onRename={(nextId) => rename(style.id, nextId)}
          onRestore={() => setList(removeById(own, style.id))}
          onRemove={() => remove(style.id)}
        />
      ))}
      <Button
        variant="outline"
        size="xs"
        icon={<Plus size={12} />}
        onClick={() => setList([...own, { id: nextFreeId('balloon', ids), name: labels.comicsBalloonNewName }])}
        className="mt-1"
      >
        {labels.comicsBalloonAdd}
      </Button>
    </CollapsibleSection>
  );
});
