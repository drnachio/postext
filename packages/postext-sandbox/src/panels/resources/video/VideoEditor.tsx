'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Film, Loader2, RefreshCw } from 'lucide-react';
import { parseVideoUrl, videoFormatOfUrl, type Resource, type ResourceVideo, type VideoPlayerOptions, type VideoSource } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext.js';
import type { SandboxLabels } from '../../../types/labels.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { useFieldIds } from '../../../controls/fieldContext.js';
import { NumberInput, SelectInput } from '../../../controls/index.js';
import { Button } from '../../../ui/index.js';
import { attachVideoSource } from 'postext-folio';
import { BitmapUploader, type BitmapUploadResult } from '../uploads/BitmapUploader.js';
import { useBlobObjectUrl } from '../ResourcePreview.js';
import {
  VIDEO_ACCEPT,
  captureFrame,
  fetchStreamInfo,
  formatDuration,
  videoFormatOf,
} from './videoMedia.js';
import {
  VIDEO_PLAYER_SOURCES,
  addressEdit,
  isHttp,
  isNewStreamVideo,
  mergeVideo,
  playerWith,
  posterEdit,
  sourceSwitched,
  streamInfoEdit,
  videoFileEdit,
} from './videoEdits.js';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-2 py-1.5';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)', fontFamily: 'inherit', fontSize: 13, lineHeight: '20px' } as const;
const noteStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

type PlayerKey = keyof VideoPlayerOptions;

/** A web address typed into a field row, named by the row's label and
 *  described by its help, committed on blur or Enter. */
function UrlControl({ value, placeholder, onChange, onCommit }: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const ids = useFieldIds();
  return (
    <input
      type="url"
      dir="ltr"
      id={ids?.controlId}
      aria-describedby={ids?.descriptionId}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
      }}
      className={inputClass}
      style={inputStyle}
    />
  );
}

/** The per-video player switches the panel offers, and which sources honour
 *  each (the rest are left to the book's Video style). */
const PLAYER_SWITCHES: { key: Exclude<PlayerKey, 'preload'>; label: (l: SandboxLabels) => string; help: (l: SandboxLabels) => string; sources: VideoSource[]; inverted?: boolean }[] = [
  { key: 'controls', label: (l) => l.videoPlayerControls, help: (l) => l.videoPlayerControlsHelp, sources: VIDEO_PLAYER_SOURCES.controls },
  { key: 'download', label: (l) => l.videoPlayerDownload, help: (l) => l.videoPlayerDownloadHelp, sources: VIDEO_PLAYER_SOURCES.download },
  { key: 'fullscreen', label: (l) => l.videoPlayerFullscreen, help: (l) => l.videoPlayerFullscreenHelp, sources: VIDEO_PLAYER_SOURCES.fullscreen },
  { key: 'playbackRate', label: (l) => l.videoPlayerPlaybackRate, help: (l) => l.videoPlayerPlaybackRateHelp, sources: VIDEO_PLAYER_SOURCES.playbackRate },
  { key: 'pictureInPicture', label: (l) => l.videoPlayerPictureInPicture, help: (l) => l.videoPlayerPictureInPictureHelp, sources: VIDEO_PLAYER_SOURCES.pictureInPicture },
  { key: 'remotePlayback', label: (l) => l.videoPlayerRemotePlayback, help: (l) => l.videoPlayerRemotePlaybackHelp, sources: VIDEO_PLAYER_SOURCES.remotePlayback },
  { key: 'autoplay', label: (l) => l.videoPlayerAutoplay, help: (l) => l.videoPlayerAutoplayHelp, sources: VIDEO_PLAYER_SOURCES.autoplay },
  { key: 'muted', label: (l) => l.videoPlayerMuted, help: (l) => l.videoPlayerMutedHelp, sources: VIDEO_PLAYER_SOURCES.muted },
  { key: 'loop', label: (l) => l.videoPlayerLoop, help: (l) => l.videoPlayerLoopHelp, sources: VIDEO_PLAYER_SOURCES.loop },
  // `exclusive`, shown the positive way round: "on" stores `false`.
  { key: 'exclusive', label: (l) => l.videoPlayerAlongside, help: (l) => l.videoPlayerAlongsideHelp, sources: VIDEO_PLAYER_SOURCES.exclusive, inverted: true },
  { key: 'privacy', label: (l) => l.videoPlayerPrivacy, help: (l) => l.videoPlayerPrivacyHelp, sources: VIDEO_PLAYER_SOURCES.privacy },
];

interface VideoEditorProps {
  resource: Resource;
  /** Commit a change of the resource (the caller stamps `updatedAt`). */
  onChange: (partial: Partial<Resource>) => void;
}

/** The video of a `kind: 'video'` resource (#454): where it plays from, its
 *  poster frame, the part that plays and this video's player options. */
export function VideoEditor({ resource, onChange }: VideoEditorProps) {
  const labels = useSandboxLabels();
  const video: ResourceVideo = useMemo(() => resource.video ?? { source: 'youtube' }, [resource.video]);
  const source = video.source;
  const setVideo = useCallback(
    (partial: Partial<ResourceVideo>, extra: Partial<Resource> = {}) => {
      onChange({ video: mergeVideo(video, partial), ...extra });
    },
    [video, onChange],
  );

  const setSource = (next: VideoSource) => {
    if (next === source) return;
    setVideo(sourceSwitched(next));
  };

  return (
    <div className="flex flex-col gap-4">
      <SelectInput
        label={labels.resourceVideoSource}
        tooltip={labels.resourceVideoSourceHelp}
        stacked
        variant="segmented"
        isDefault
        value={source}
        options={[
          { value: 'youtube', label: labels.resourceVideoSourceYoutube },
          { value: 'vimeo', label: labels.resourceVideoSourceVimeo },
          { value: 'file', label: labels.resourceVideoSourceFile },
        ]}
        onChange={(v) => setSource(v as VideoSource)}
      />
      {source === 'file'
        ? <FileVideo resource={resource} video={video} setVideo={setVideo} />
        : <StreamVideo key={source} resource={resource} video={video} source={source} setVideo={setVideo} />}
      <PosterField video={video} setVideo={setVideo} />
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label={labels.resourceVideoStart}
          tooltip={labels.resourceVideoRangeHelp}
          value={video.start ?? 0}
          isDefault={!video.start}
          onReset={() => setVideo({ start: undefined })}
          min={0}
          max={86400}
          step={1}
          onChange={(v) => setVideo({ start: v > 0 ? v : undefined })}
        />
        <NumberInput
          label={labels.resourceVideoEnd}
          tooltip={labels.resourceVideoRangeHelp}
          value={video.end ?? 0}
          isDefault={!video.end}
          onReset={() => setVideo({ end: undefined })}
          min={0}
          max={86400}
          step={1}
          onChange={(v) => setVideo({ end: v > 0 ? v : undefined })}
        />
      </div>
      <PlayerOverrides video={video} setVideo={setVideo} />
    </div>
  );
}

interface PartProps {
  resource?: Resource;
  video: ResourceVideo;
  setVideo: (partial: Partial<ResourceVideo>, extra?: Partial<Resource>) => void;
}

/** A YouTube or Vimeo link: committed on blur or Enter, and a new video's
 *  poster, frame size and title fetched from the platform. */
function StreamVideo({ resource, video, source, setVideo }: PartProps & { source: 'youtube' | 'vimeo' }) {
  const labels = useSandboxLabels();
  const [draft, setDraft] = useState(video.url ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const platform = source === 'youtube' ? labels.resourceVideoSourceYoutube : labels.resourceVideoSourceVimeo;
  const parsed = parseVideoUrl(draft);
  const valid = !!parsed && parsed.source === source;

  const fetchPoster = async (url: string, setUrl: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      const info = await fetchStreamInfo(source, url);
      if (!info.poster) setFailed(true);
      const edit = streamInfoEdit(info, setUrl ? url : undefined, resource);
      setVideo(edit.video, edit.resource);
    } catch {
      setFailed(true);
      if (setUrl) setVideo({ url });
    } finally {
      setBusy(false);
    }
  };

  const commit = () => {
    const url = draft.trim();
    if (url === (video.url ?? '')) return;
    // A new video: its own poster. The same video at another start keeps it.
    if (isNewStreamVideo(source, url, video.url)) void fetchPoster(url, true);
    else setVideo({ url: url || undefined });
  };

  return (
    <FieldRow stacked label={labels.resourceVideoUrl} tooltip={labels.resourceVideoUrlHelp} className="mb-0">
      <div className="flex w-full min-w-0 flex-col">
      <UrlControl
        value={draft}
        placeholder={source === 'youtube' ? 'https://youtu.be/…' : 'https://vimeo.com/…'}
        onChange={setDraft}
        onCommit={commit}
      />
      <div className="mt-1 flex items-center gap-2" style={noteStyle}>
        {busy ? (
          <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" aria-hidden="true" />{labels.resourceVideoFetching}</span>
        ) : draft.trim() === '' ? null : valid ? (
          <span>{labels.resourceVideoUrlRecognised.replace('__source__', platform).replace('__id__', parsed!.id)}</span>
        ) : (
          <span role="alert" style={{ color: 'var(--danger, #c0392b)' }}>{labels.resourceVideoUrlInvalid.replace('__source__', platform)}</span>
        )}
        {failed && !busy && <span role="alert">{labels.resourceVideoFetchFailed}</span>}
      </div>
      {valid && !busy && (
        <div className="mt-1">
          <Button variant="outline" size="xs" icon={<RefreshCw size={12} />} onClick={() => void fetchPoster(draft.trim(), draft.trim() !== video.url)}>
            {labels.resourceVideoFetchPoster}
          </Button>
        </div>
      )}
      </div>
    </FieldRow>
  );
}

/** A self-hosted video: the upload or its address alone (an MP4 or WebM on
 *  a server, an HLS stream, #476), the frame picker and the production
 *  address. */
function FileVideo({ video, setVideo }: PartProps) {
  const labels = useSandboxLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState(video.url ?? '');
  const src = useBlobObjectUrl(video.fileId);
  useEffect(() => setUrlDraft(video.url ?? ''), [video.url]);
  /** A new address was typed: its size and length are read once it loads
   *  (opening the editor reads nothing, so it never edits the video). */
  const readNext = useRef(false);
  // No file: the video plays from its address (hls.js for a stream the
  // browser does not play itself).
  const address = !video.fileId && isHttp(video.url) ? video.url.trim() : undefined;
  const hls = (video.format ?? videoFormatOfUrl(address)) === 'hls';
  useEffect(() => {
    const el = playerRef.current;
    if (!el || !address) return;
    let release: (() => void) | undefined;
    let gone = false;
    void attachVideoSource(el, address, { hls }).then(
      (r) => (gone ? r() : (release = r)),
      () => !gone && setError(labels.resourceVideoInvalid),
    );
    return () => {
      gone = true;
      release?.();
    };
  }, [address, hls, labels.resourceVideoInvalid]);

  const handleFile = async (file: File) => {
    setError(null);
    if (!videoFormatOf(file)) {
      setError(labels.resourceVideoInvalid);
      return;
    }
    setBusy(true);
    try {
      const edit = await videoFileEdit(file);
      if (edit) setVideo(edit);
    } catch {
      setError(labels.resourceVideoInvalid);
    } finally {
      setBusy(false);
    }
  };

  const takeFrame = async () => {
    const el = playerRef.current;
    if (!el || el.readyState < 2) return;
    el.pause();
    setError(null);
    try {
      const poster = await captureFrame(el);
      setVideo({ poster, posterTime: Math.round(el.currentTime * 100) / 100 });
    } catch {
      // A frame from a server that refuses cross-origin reads taints the
      // canvas.
      setError(labels.resourceVideoFrameBlocked);
    }
  };

  const commitUrl = () => {
    const url = urlDraft.trim();
    if (url === (video.url ?? '')) return;
    setError(null);
    readNext.current = !video.fileId;
    setVideo(addressEdit(video, url));
  };

  /** An address's size and length, read once it loads. */
  const readAddress = (el: HTMLVideoElement) => {
    if (!address || !readNext.current) return;
    readNext.current = false;
    const duration = Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : undefined;
    const width = el.videoWidth || undefined;
    const height = el.videoHeight || undefined;
    if (width !== video.width || height !== video.height || duration !== video.duration) setVideo({ width, height, duration });
  };

  return (
    <>
      <FieldRow stacked label={labels.resourceVideoFile} className="mb-0">
        <div className="flex w-full min-w-0 flex-col">
        {(video.fileId || address) && (
          <span style={noteStyle} className="mb-1">
            {[hls ? labels.resourceVideoHls : (video.format ?? videoFormatOfUrl(address))?.toUpperCase(), video.width && video.height ? `${video.width}×${video.height}px` : '', video.duration ? formatDuration(video.duration) : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className="flex items-center justify-center gap-1.5 rounded border border-dashed text-xs"
          style={{ borderColor: 'var(--rule)', color: 'var(--slate)', padding: video.fileId ? 8 : 16, cursor: busy ? 'wait' : 'pointer' }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Film size={14} aria-hidden="true" />}
          <span>{busy ? labels.uploadStoring : video.fileId ? labels.resourceVideoReplace : labels.resourceVideoUpload}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={VIDEO_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
        {error && <span role="alert" style={{ ...noteStyle, color: 'var(--danger, #c0392b)' }}>{error}</span>}
        </div>
      </FieldRow>
      {((video.fileId && src) || address) && (
        <FieldRow stacked label={labels.resourceVideoFrame} tooltip={labels.resourceVideoFrameHelp} className="mb-0">
          <div className="flex w-full min-w-0 flex-col">
          <video
            key={video.fileId ? 'file' : address}
            ref={playerRef}
            src={video.fileId ? src ?? undefined : undefined}
            crossOrigin={address ? 'anonymous' : undefined}
            onLoadedMetadata={(e) => readAddress(e.currentTarget)}
            controls
            muted
            playsInline
            preload="auto"
            className="w-full rounded"
            style={{ maxHeight: 220, backgroundColor: '#000' }}
            onLoadedData={(e) => {
              // Open on the frame the poster shows.
              if (video.posterTime) e.currentTarget.currentTime = video.posterTime;
            }}
          />
          <div className="mt-1">
            <Button variant="outline" size="xs" icon={<Camera size={12} />} onClick={() => void takeFrame()}>
              {labels.resourceVideoUseFrame}
            </Button>
          </div>
          </div>
        </FieldRow>
      )}
      <FieldRow
        stacked
        label={video.fileId ? labels.resourceVideoProductionUrl : labels.resourceVideoSourceUrl}
        tooltip={video.fileId ? labels.resourceVideoProductionUrlHelp : labels.resourceVideoSourceUrlHelp}
        className="mb-0"
      >
        <div className="flex w-full min-w-0 flex-col">
          <UrlControl value={urlDraft} placeholder="https://" onChange={setUrlDraft} onCommit={commitUrl} />
          {!/^https?:\/\/\S+$/i.test(urlDraft.trim()) && (
            <span style={noteStyle} className="mt-1">{labels.resourceVideoProductionUrlMissing}</span>
          )}
        </div>
      </FieldRow>
    </>
  );
}

/** The poster: what is printed, replaceable by an uploaded picture. */
function PosterField({ video, setVideo }: PartProps) {
  const labels = useSandboxLabels();
  const url = useBlobObjectUrl(video.poster?.fileId);
  const applyPoster = (r: BitmapUploadResult) => {
    setVideo(posterEdit(r));
  };
  return (
    <FieldRow stacked label={labels.resourceVideoPoster} tooltip={labels.resourceVideoPosterHelp} className="mb-0">
      <div className="flex w-full min-w-0 flex-col">
      {video.poster && (
        <div className="mb-1 flex items-center gap-2">
          {url && <img src={url} alt="" className="rounded" style={{ width: 96, aspectRatio: `${video.poster.width || 16} / ${video.poster.height || 9}`, objectFit: 'cover' }} />}
          <span style={noteStyle}>{video.poster.width}×{video.poster.height}px</span>
        </div>
      )}
      <BitmapUploader onUploaded={applyPoster} compact={!!video.poster} />
      </div>
    </FieldRow>
  );
}

/** This video's player options: each follows the book's Video style unless
 *  set here. Only the switches the video's player honours are shown. */
function PlayerOverrides({ video, setVideo }: PartProps) {
  const labels = useSandboxLabels();
  const player = video.player ?? {};
  const set = (key: PlayerKey, value: string, inverted = false) => {
    const stored = value === 'inherit' ? undefined : key === 'preload' ? value : (value === 'on') !== inverted;
    setVideo({ player: playerWith(player, key, stored as VideoPlayerOptions[PlayerKey]) });
  };
  const options = [
    { value: 'inherit', label: labels.resourceVideoInherit },
    { value: 'on', label: labels.resourceVideoOn },
    { value: 'off', label: labels.resourceVideoOff },
  ];
  return (
    <FieldRow stacked label={labels.resourceVideoPlayer} tooltip={labels.resourceVideoPlayerHelp} className="mb-0">
      <div className="flex w-full min-w-0 flex-col">
        {PLAYER_SWITCHES.filter((s) => s.sources.includes(video.source)).map((s) => (
          <SelectInput
            key={s.key}
            label={s.label(labels)}
            tooltip={s.help(labels)}
            value={player[s.key] === undefined ? 'inherit' : !player[s.key] === !!s.inverted ? 'on' : 'off'}
            options={options}
            isDefault={player[s.key] === undefined}
            onReset={() => set(s.key, 'inherit')}
            onChange={(v) => set(s.key, v, s.inverted)}
          />
        ))}
        {video.source === 'file' && (
          <SelectInput
            label={labels.videoPlayerPreload}
            tooltip={labels.videoPlayerPreloadHelp}
            value={player.preload ?? 'inherit'}
            options={[
              { value: 'inherit', label: labels.resourceVideoInherit },
              { value: 'none', label: labels.videoPlayerPreloadNone },
              { value: 'metadata', label: labels.videoPlayerPreloadMetadata },
              { value: 'auto', label: labels.videoPlayerPreloadAuto },
            ]}
            isDefault={player.preload === undefined}
            onReset={() => set('preload', 'inherit')}
            onChange={(v) => set('preload', v)}
          />
        )}
      </div>
    </FieldRow>
  );
}
