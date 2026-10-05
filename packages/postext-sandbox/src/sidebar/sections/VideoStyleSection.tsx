'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveVideoStyleConfig } from 'postext';
import type {
  DimensionUnit,
  VideoOverlayPosition,
  VideoPlayMarkConfig,
  VideoPlayerOptions,
  VideoQrConfig,
  VideoStyleConfig,
} from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FieldGroup,
  NestedGroup,
  NumberInput,
  SelectInput,
  ToggleSwitch,
} from '../../controls';

const SIZE_UNITS: DimensionUnit[] = ['mm', 'cm', 'in', 'pt', 'px'];

type PlayerSwitch = Exclude<keyof VideoPlayerOptions, 'preload'>;

/** Config-panel section for video resources (#454): what is printed on a
 *  video's poster (the play mark, the QR code), whether the poster links to
 *  the video, and the player the interactive outputs offer. */
export const VideoStyleSection = memo(function VideoStyleSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.videoStyle);
  const vs = resolveVideoStyleConfig(raw);

  const write = (next: VideoStyleConfig | undefined) => {
    const clean = next && Object.keys(next).length > 0 ? next : undefined;
    dispatch({ type: 'UPDATE_CONFIG', payload: { videoStyle: clean } });
  };
  const update = (partial: Partial<VideoStyleConfig>) => write({ ...raw, ...partial });
  const resetField = (field: keyof VideoStyleConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  /** A nested group's field: set, or reset (`undefined`). */
  const setIn = <G extends 'playMark' | 'qr' | 'player'>(group: G, key: string, value: unknown) => {
    const current = { ...((raw?.[group] as Record<string, unknown> | undefined) ?? {}) };
    if (value === undefined) delete current[key];
    else current[key] = value;
    const next: VideoStyleConfig = { ...raw };
    if (Object.keys(current).length > 0) (next as Record<string, unknown>)[group] = current;
    else delete next[group];
    write(next);
  };
  const pm = (key: keyof VideoPlayMarkConfig, value: unknown) => setIn('playMark', key, value);
  const qr = (key: keyof VideoQrConfig, value: unknown) => setIn('qr', key, value);
  const unsetPm = (key: keyof VideoPlayMarkConfig) => raw?.playMark?.[key] === undefined;
  const unsetQr = (key: keyof VideoQrConfig) => raw?.qr?.[key] === undefined;
  const positionOptions: { value: VideoOverlayPosition; label: string }[] = [
    { value: 'center', label: labels.videoPositionCenter },
    { value: 'top-left', label: labels.videoPositionTopLeft },
    { value: 'top', label: labels.videoPositionTop },
    { value: 'top-right', label: labels.videoPositionTopRight },
    { value: 'left', label: labels.videoPositionLeft },
    { value: 'right', label: labels.videoPositionRight },
    { value: 'bottom-left', label: labels.videoPositionBottomLeft },
    { value: 'bottom', label: labels.videoPositionBottom },
    { value: 'bottom-right', label: labels.videoPositionBottomRight },
  ];
  const playerSwitches: { key: PlayerSwitch; label: string; help: string }[] = [
    { key: 'controls', label: labels.videoPlayerControls, help: labels.videoPlayerControlsHelp },
    { key: 'download', label: labels.videoPlayerDownload, help: labels.videoPlayerDownloadHelp },
    { key: 'fullscreen', label: labels.videoPlayerFullscreen, help: labels.videoPlayerFullscreenHelp },
    { key: 'playbackRate', label: labels.videoPlayerPlaybackRate, help: labels.videoPlayerPlaybackRateHelp },
    { key: 'pictureInPicture', label: labels.videoPlayerPictureInPicture, help: labels.videoPlayerPictureInPictureHelp },
    { key: 'remotePlayback', label: labels.videoPlayerRemotePlayback, help: labels.videoPlayerRemotePlaybackHelp },
    { key: 'autoplay', label: labels.videoPlayerAutoplay, help: labels.videoPlayerAutoplayHelp },
    { key: 'muted', label: labels.videoPlayerMuted, help: labels.videoPlayerMutedHelp },
    { key: 'loop', label: labels.videoPlayerLoop, help: labels.videoPlayerLoopHelp },
    { key: 'privacy', label: labels.videoPlayerPrivacy, help: labels.videoPlayerPrivacyHelp },
  ];

  return (
    <CollapsibleSection
      title={labels.videoStyleSection}
      sectionId="videoStyle"
      onReset={() => write(undefined)}
      hasOverrides={raw !== undefined && Object.keys(raw).length > 0}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FieldGroup title={labels.videoPlayMark} description={labels.videoPlayMarkDescription}>
        <ToggleSwitch
          label={labels.videoPlayMarkEnabled}
          checked={vs.playMark.enabled}
          onChange={(v) => pm('enabled', v)}
          isDefault={unsetPm('enabled')}
          onReset={() => pm('enabled', undefined)}
        />
        {vs.playMark.enabled && (
          <NestedGroup>
            <SelectInput
              label={labels.videoPlayMarkShape}
              tooltip={labels.videoPlayMarkShapeHelp}
              value={vs.playMark.shape}
              variant="segmented"
              options={[
                { value: 'circle', label: labels.videoPlayMarkCircle },
                { value: 'rounded', label: labels.videoPlayMarkRounded },
                { value: 'triangle', label: labels.videoPlayMarkTriangle },
              ]}
              onChange={(v) => pm('shape', v)}
              isDefault={unsetPm('shape')}
              onReset={() => pm('shape', undefined)}
            />
            <SelectInput
              label={labels.videoOverlayPosition}
              value={vs.playMark.position}
              options={positionOptions}
              onChange={(v) => pm('position', v)}
              isDefault={unsetPm('position')}
              onReset={() => pm('position', undefined)}
            />
            <DimensionInput
              label={labels.videoPlayMarkSize}
              tooltip={labels.videoPlayMarkSizeHelp}
              value={vs.playMark.size}
              onChange={(v) => pm('size', v)}
              min={1}
              units={SIZE_UNITS}
              isDefault={unsetPm('size')}
              onReset={() => pm('size', undefined)}
            />
            {vs.playMark.position !== 'center' && (
              <DimensionInput
                label={labels.videoOverlayInset}
                tooltip={labels.videoOverlayInsetHelp}
                value={vs.playMark.inset}
                onChange={(v) => pm('inset', v)}
                min={0}
                units={SIZE_UNITS}
                isDefault={unsetPm('inset')}
                onReset={() => pm('inset', undefined)}
              />
            )}
            <ColorPicker
              label={labels.videoPlayMarkColor}
              value={vs.playMark.color}
              onChange={(v) => pm('color', v)}
              isDefault={unsetPm('color')}
              onReset={() => pm('color', undefined)}
              fieldId="videoStyle-playMark-color"
            />
            <ColorPicker
              label={labels.videoPlayMarkBackground}
              tooltip={labels.videoPlayMarkBackgroundHelp}
              value={vs.playMark.background}
              onChange={(v) => pm('background', v)}
              isDefault={unsetPm('background')}
              onReset={() => pm('background', undefined)}
              fieldId="videoStyle-playMark-background"
            />
            <NumberInput
              label={labels.videoPlayMarkOpacity}
              value={Math.round(vs.playMark.backgroundOpacity * 100)}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(v) => pm('backgroundOpacity', v / 100)}
              isDefault={unsetPm('backgroundOpacity')}
              onReset={() => pm('backgroundOpacity', undefined)}
            />
          </NestedGroup>
        )}
      </FieldGroup>

      <FieldGroup title={labels.videoQr} description={labels.videoQrDescription}>
        <ToggleSwitch
          label={labels.videoQrEnabled}
          tooltip={labels.videoQrEnabledHelp}
          checked={vs.qr.enabled}
          onChange={(v) => qr('enabled', v)}
          isDefault={unsetQr('enabled')}
          onReset={() => qr('enabled', undefined)}
        />
        {vs.qr.enabled && (
          <NestedGroup>
            <SelectInput
              label={labels.videoOverlayPosition}
              value={vs.qr.position}
              options={positionOptions}
              onChange={(v) => qr('position', v)}
              isDefault={unsetQr('position')}
              onReset={() => qr('position', undefined)}
            />
            <DimensionInput
              label={labels.videoQrSize}
              tooltip={labels.videoQrSizeHelp}
              value={vs.qr.size}
              onChange={(v) => qr('size', v)}
              min={5}
              units={SIZE_UNITS}
              isDefault={unsetQr('size')}
              onReset={() => qr('size', undefined)}
            />
            {vs.qr.position !== 'center' && (
              <DimensionInput
                label={labels.videoOverlayInset}
                tooltip={labels.videoOverlayInsetHelp}
                value={vs.qr.inset}
                onChange={(v) => qr('inset', v)}
                min={0}
                units={SIZE_UNITS}
                isDefault={unsetQr('inset')}
                onReset={() => qr('inset', undefined)}
              />
            )}
            <SelectInput
              label={labels.videoQrErrorCorrection}
              tooltip={labels.videoQrErrorCorrectionHelp}
              value={vs.qr.errorCorrection}
              variant="segmented"
              options={['L', 'M', 'Q', 'H'].map((v) => ({ value: v, label: v }))}
              onChange={(v) => qr('errorCorrection', v)}
              isDefault={unsetQr('errorCorrection')}
              onReset={() => qr('errorCorrection', undefined)}
            />
            <NumberInput
              label={labels.videoQrQuietZone}
              tooltip={labels.videoQrQuietZoneHelp}
              value={vs.qr.quietZone}
              min={0}
              max={8}
              onChange={(v) => qr('quietZone', v)}
              isDefault={unsetQr('quietZone')}
              onReset={() => qr('quietZone', undefined)}
            />
            <ColorPicker
              label={labels.videoQrColor}
              value={vs.qr.color}
              onChange={(v) => qr('color', v)}
              isDefault={unsetQr('color')}
              onReset={() => qr('color', undefined)}
              fieldId="videoStyle-qr-color"
            />
            <ColorPicker
              label={labels.videoQrBackground}
              value={vs.qr.background}
              onChange={(v) => qr('background', v)}
              isDefault={unsetQr('background')}
              onReset={() => qr('background', undefined)}
              fieldId="videoStyle-qr-background"
            />
            <DimensionInput
              label={labels.videoQrRadius}
              value={vs.qr.radius}
              onChange={(v) => qr('radius', v)}
              min={0}
              units={SIZE_UNITS}
              isDefault={unsetQr('radius')}
              onReset={() => qr('radius', undefined)}
            />
          </NestedGroup>
        )}
      </FieldGroup>

      <FieldGroup title={labels.videoOutputs} description={labels.videoOutputsDescription}>
        <ToggleSwitch
          label={labels.videoLinkPoster}
          tooltip={labels.videoLinkPosterHelp}
          checked={vs.linkPoster}
          onChange={(v) => update({ linkPoster: v })}
          isDefault={raw?.linkPoster === undefined}
          onReset={() => resetField('linkPoster')}
        />
        <SelectInput
          label={labels.videoHtml}
          tooltip={labels.videoHtmlHelp}
          value={vs.html}
          variant="segmented"
          options={[
            { value: 'player', label: labels.videoHtmlPlayer },
            { value: 'poster', label: labels.videoHtmlPoster },
          ]}
          onChange={(v) => update({ html: v as 'player' | 'poster' })}
          isDefault={raw?.html === undefined}
          onReset={() => resetField('html')}
        />
      </FieldGroup>

      <FieldGroup title={labels.videoPlayer} description={labels.videoPlayerDescription}>
        {playerSwitches.map((s) => (
          <ToggleSwitch
            key={s.key}
            label={s.label}
            tooltip={s.help}
            checked={vs.player[s.key]}
            onChange={(v) => setIn('player', s.key, v)}
            isDefault={raw?.player?.[s.key] === undefined}
            onReset={() => setIn('player', s.key, undefined)}
          />
        ))}
        <SelectInput
          label={labels.videoPlayerPreload}
          tooltip={labels.videoPlayerPreloadHelp}
          value={vs.player.preload}
          options={[
            { value: 'none', label: labels.videoPlayerPreloadNone },
            { value: 'metadata', label: labels.videoPlayerPreloadMetadata },
            { value: 'auto', label: labels.videoPlayerPreloadAuto },
          ]}
          onChange={(v) => setIn('player', 'preload', v)}
          isDefault={raw?.player?.preload === undefined}
          onReset={() => setIn('player', 'preload', undefined)}
        />
      </FieldGroup>
    </CollapsibleSection>
  );
});
