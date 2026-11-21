'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PROMO_FORMATS,
  renderPageToCanvas,
  resolvePrintConfig,
  type PostextConfig,
  type ProductionVersion,
  type Resource,
  type VDTDocument,
  type VersionSheets,
} from 'postext';
import { createPdfWorker } from 'postext-pdf/worker';
import { Button, Select, announce } from '../ui/index.js';
import { ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { ensureResourceImages } from '../controls/media/resourceImages.js';
import { buildPdfResourceBytes } from '../viewport/pdf/pdfResourceBytes.js';
import { downloadBytes } from '../storage/persistence.js';
import { fill } from '../print/fillTokens.js';
import { loadPrintProfile, outputProfileBaseUrl } from '../print/printSetup.js';
import { createPdfFontProvider } from '../viewport/pdf/pdfFontProvider.js';
import { useLayoutWorker } from '../worker/useLayoutWorker.js';
import { promoImage } from './store/promoImage.js';
import { CoverChecksList } from './CoverChecksList.js';
import { coverChecks, overflowZones, type CoverCheck } from './model/coverChecks.js';
import { galleryResourceId } from './library/coverGallery.js';
import { logoResourceId } from './library/logoLibrary.js';
import {
  bookTrimMm,
  isPromo,
  coverDocumentInput,
  pickSheet,
  sheetFileName,
  type BookProduction,
  type CoverDesignSettings,
  type CoverTextZone,
  type SheetChoice,
} from './model/bookProduction.js';
import { HEADING, mm1, type Labels } from './productionUi.js';
import { registerCoverImages } from './library/coverImages.js';
import { useCollections, useCoverGallery, useLogos, useMirror } from './store/useProduction.js';
import { endpaperInput, type BookEndpapers } from './library/collections.js';


const ZONE_LABEL: Record<CoverTextZone, keyof Labels> = {
  front: 'productionZoneFront',
  spine: 'productionZoneSpine',
  back: 'productionZoneBack',
  flapFront: 'productionZoneFlapFront',
  flapBack: 'productionZoneFlapBack',
};

export const SHEET_LABEL: Record<SheetChoice, keyof Labels> = {
  cover: 'productionSheetCover',
  jacket: 'productionSheetJacket',
  endpaperFront: 'productionSheetEndpaperFront',
  endpaperBack: 'productionSheetEndpaperBack',
  epub: 'productionSheetEpub',
  square: 'productionSheetSquare',
  story: 'productionSheetStory',
  landscape: 'productionSheetLandscape',
};


export function SheetPreview({ config, version, texts, design, endpapers, bookResources, sheets, choices, shown, onChoose, labels, fileTitle }: {
  config: PostextConfig;
  endpapers?: BookEndpapers;
  version: ProductionVersion;
  texts: BookProduction['texts'];
  design: CoverDesignSettings | undefined;
  bookResources: readonly Resource[];
  sheets: VersionSheets;
  choices: SheetChoice[];
  shown: SheetChoice;
  onChoose: (c: SheetChoice) => void;
  labels: Labels;
  fileTitle: string;
}) {
  const { build } = useLayoutWorker('preview');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // The layout and what it was laid out from: a sheet chosen since (or
  // texts typed since) is not the one on show until it is built, and the
  // PDF only ever writes the sheet the preview shows.
  const [built, setBuilt] = useState<{ doc: VDTDocument; input: ReturnType<typeof coverDocumentInput>; sheet: SheetChoice } | null>(null);
  const doc = built?.doc ?? null;
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const library = useLogos();
  const [gallery] = useCoverGallery();
  const collections = useCollections();
  const endpaper = useMemo(() => endpaperInput(shown, endpapers, collections), [shown, endpapers, collections]);
  const mirror = useMirror(design, bookResources, sheets.measures.designMargin, gallery);
  const sheet = pickSheet(sheets, shown, bookTrimMm(config));
  // A screen picture carries no finishes: they are plates for the press.
  const input = useMemo(
    () => coverDocumentInput(sheet, version, texts, config, design, bookResources, { workIsbnLabel: labels.productionWorkIsbnCaption, ...(endpaper ? { endpaper } : {}),
      logos: library,
      gallery,
      ...(mirror ? { mirror } : {}),
      ...(isPromo(shown) ? { hidden: new Set(['finishes'] as const) } : {}),
    }),
    [sheet, version, texts, config, design, bookResources, library, gallery, shown, mirror, labels.productionWorkIsbnCaption, endpaper],
  );
  const isCaseCover = sheet.kind === 'case';
  // What to put right before printing (./coverChecks.ts), on the sheet as
  // laid out last.
  const checks = useMemo(() => coverChecks(sheet, sheet.kind === 'endpaper' ? undefined : design, {
    ...(endpaper ? { endpaperAds: (['pastedown', 'flyleaf'] as const).filter((z) => endpaper.side?.[z]?.ad && endpaper.ads.some((a) => a.id === endpaper.side![z]!.ad)) } : {}),
    pictures: new Set([...bookResources.map((r) => r.id), ...gallery.pictures.map((p) => galleryResourceId(p.id)), ...library.map((l) => logoResourceId(l.id))]),
    ...(version.isbn ? { isbn: version.isbn } : {}),
    ...(version.isbnAddOn ? { isbnAddOn: version.isbnAddOn } : {}),
    ...(config.print?.standard ? { standard: config.print.standard } : {}),
    mirror: !!input.cover.designed,
    overflow: built?.input === input ? overflowZones(built.doc) : [],
  }), [sheet, design, bookResources, gallery, library, version, config.print?.standard, input, built, endpaper]);
  const checkName = (c: CoverCheck): string => {
    // Inside a sentence («On the pastedown…»).
    if (c.zone === 'pastedown') return labels.productionEndpaperPastedown.toLocaleLowerCase();
    if (c.zone === 'flyleaf') return labels.productionEndpaperFlyleaf.toLocaleLowerCase();
    if (c.zone) return String(labels[ZONE_LABEL[c.zone as CoverTextZone] ?? 'productionZoneFront']);
    const items = [...(design?.elements ?? []), ...(design?.effects ?? []), ...(design?.logos ?? []), ...(design?.finishes ?? [])];
    const item = items.find((x) => x.id === c.id);
    if (item?.name) return item.name;
    if (c.layer === 'finishes') return labels.coverItemFinish;
    if (c.layer === 'logos') return labels.coverItemLogo;
    if (c.layer === 'effects') return labels.coverItemEffect;
    return labels.coverElementPicture;
  };

  useEffect(() => {
    let alive = true;
    setFailed(false);
    const t = setTimeout(() => {
      void (async () => {
        try {
          await ensureConfigFontsLoaded(input.config, input.markdown);
          await registerCoverImages(input.cover.files);
          await ensureResourceImages(input.resources.filter((r) => r.id !== 'isbn-barcode'));
          const laid = await build({ markdown: input.markdown, resources: input.resources }, input.config);
          if (alive) setBuilt({ doc: laid, input, sheet: shown });
        } catch {
          if (alive) setFailed(true);
        }
      })();
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [build, input, shown]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const page = doc?.pages[0];
    if (!canvas || !wrap || !doc || !page) return;
    const width = wrap.clientWidth || 280;
    const dpr = window.devicePixelRatio || 1;
    renderPageToCanvas(page, doc, canvas, { scale: (width * dpr) / page.width });
    canvas.style.width = `${width}px`;
    canvas.style.height = `${(width * page.height) / page.width}px`;
  }, [doc]);

  const exportImage = async () => {
    if (!built || built.input !== input || !isPromo(built.sheet)) return;
    setBusy(true);
    try {
      const px = PROMO_FORMATS[built.sheet];
      const bytes = await promoImage(built.doc, px.width, px.height);
      if (!bytes) return;
      const name = sheetFileName(fileTitle, version.name, built.sheet);
      downloadBytes(bytes, name, 'image/jpeg');
      announce(fill(labels.productionExported, { name }));
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    if (!built || built.input !== input) return;
    if (isPromo(built.sheet)) return exportImage();
    setBusy(true);
    announce(labels.productionExporting);
    try {
      const print = resolvePrintConfig(config.print);
      const outputProfile = print.standard !== 'none'
        ? await loadPrintProfile(print).then((p) => p.bytes, () => undefined)
        : undefined;
      // Finishes go to the press as solid plates that overprint: the sheet
      // is laid out again with them so, when it has any.
      const press = design?.finishes?.length
        ? coverDocumentInput(sheet, version, texts, config, design, bookResources, { workIsbnLabel: labels.productionWorkIsbnCaption, ...(endpaper ? { endpaper } : {}), logos: library, gallery, press: true, ...(mirror ? { mirror } : {}) })
        : built.input;
      const pressDoc = press === built.input ? built.doc : await build({ markdown: press.markdown, resources: press.resources }, press.config);
      const own = new Set(Object.keys(press.cover.files));
      const { bytes: resourceBytes, previews: previewBytes } = await buildPdfResourceBytes(press.resources.filter((r) => !own.has(r.svg?.fileId ?? r.bitmap?.fileId ?? '')), config);
      for (const [fileId, bytes] of Object.entries(press.cover.files)) resourceBytes.set(fileId, bytes);
      const worker = createPdfWorker();
      try {
        const bytes = await worker.render([pressDoc], {
          fontProvider: createPdfFontProvider(),
          resourceBytes,
          ...(previewBytes.size > 0 ? { previewBytes } : {}),
          ...(config.print ? { print: config.print } : {}),
          ...(outputProfile ? { outputProfile } : {}),
          profileBaseUrl: outputProfileBaseUrl(),
        });
        const name = sheetFileName(fileTitle, version.name, built.sheet);
        downloadBytes(bytes, name, 'application/pdf');
        announce(fill(labels.productionExported, { name }));
      } finally {
        worker.dispose();
      }
    } finally {
      setBusy(false);
    }
  };


  return (
    <section className="flex flex-col gap-2">
      <h3 className={HEADING}>{labels.productionSheet}</h3>
      {choices.length > 1 && (
        <Select
          size="sm"
          value={shown}
          onValueChange={onChoose}
          options={choices.map((c) => ({
            value: c,
            label: String(labels[c === 'cover' && isCaseCoverOf(sheets) ? 'productionSheetCase' : SHEET_LABEL[c]]),
          }))}
          ariaLabel={labels.productionSheet}
        />
      )}
      <p className="m-0 text-xs text-(--slate)">
        {(isCaseCover ? labels.productionSheetCase : String(labels[SHEET_LABEL[shown]]))} · {isPromo(shown)
          ? fill(labels.productionSheetPixels, { width: String(PROMO_FORMATS[shown].width), height: String(PROMO_FORMATS[shown].height) })
          : fill(labels.productionSheetSize, { width: mm1(sheet.width), height: mm1(sheet.height) })}
      </p>
      <div ref={wrapRef} className="w-full overflow-hidden rounded border border-(--rule) bg-white">
        {failed ? <p className="m-0 p-2 text-xs text-(--slate)">{labels.productionPreviewFailed}</p> : <canvas ref={canvasRef} className="block" />}
      </div>
      {!isPromo(shown) && (
        <CoverChecksList checks={checks} labels={labels} nameOf={checkName} />
      )}
      <div className="flex justify-end gap-2">
        <Button variant="primary" size="sm" disabled={!built || built.input !== input || busy} onClick={() => void exportPdf()}>
          {busy ? labels.productionExporting : isPromo(shown) ? labels.productionExportImage : labels.productionExportPdf}
        </Button>
      </div>
    </section>
  );
}

export const isCaseCoverOf = (sheets: VersionSheets) => sheets.cover.kind === 'case';
