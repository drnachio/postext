import { CssGapVsEditorial } from "./introduction/CssGapVsEditorial";
import { PretextPostextPipeline } from "./introduction/PretextPostextPipeline";
import { LayoutProcess } from "./introduction/LayoutProcess";
import { SystemArchitecture } from "./architecture/SystemArchitecture";
import { VdtStructure } from "./architecture/VdtStructure";
import { ConvergenceLoop } from "./architecture/ConvergenceLoop";
import { VerticalRhythm } from "./architecture/VerticalRhythm";
import { DataFlow } from "./architecture/DataFlow";
import { ContentModel } from "./architecture/ContentModel";
import { ReferenceResolution } from "./architecture/ReferenceResolution";
import { GreedyVsKnuthPlass } from "./justification/GreedyVsKnuthPlass";
import { BadnessCurve } from "./justification/BadnessCurve";
import { FitnessClasses } from "./justification/FitnessClasses";
import { BoxGluePenalty } from "./justification/BoxGluePenalty";
import { HyphenationExample } from "./justification/HyphenationExample";
import { PageSizes } from "./configuration/PageSizes";
import { TypographyScale } from "./configuration/TypographyScale";
import { ColumnGutter } from "./configuration/ColumnGutter";
import { SpacingScale } from "./configuration/SpacingScale";
import { MarginSystem } from "./configuration/MarginSystem";
import { BlockTypesGallery } from "./document-format/BlockTypesGallery";
import { ListNesting } from "./document-format/ListNesting";
import { InlineFormatting } from "./document-format/InlineFormatting";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: Record<string, React.ComponentType<{ labels: any }>> = {
  CssGapVsEditorial,
  PretextPostextPipeline,
  LayoutProcess,
  SystemArchitecture,
  VdtStructure,
  ConvergenceLoop,
  VerticalRhythm,
  DataFlow,
  ContentModel,
  ReferenceResolution,
  GreedyVsKnuthPlass,
  BadnessCurve,
  FitnessClasses,
  BoxGluePenalty,
  HyphenationExample,
  PageSizes,
  TypographyScale,
  ColumnGutter,
  SpacingScale,
  MarginSystem,
  BlockTypesGallery,
  ListNesting,
  InlineFormatting,
};

interface IllustrationProps {
  name: string;
  data: string;
}

export function Illustration({ name, data }: IllustrationProps) {
  const Component = registry[name];
  if (!Component) {
    return <div style={{ padding: "1rem", border: "2px dashed #c00", color: "#c00" }}>Unknown illustration: {name}</div>;
  }
  let labels: unknown;
  try {
    labels = JSON.parse(data);
  } catch (err) {
    return <div style={{ padding: "1rem", border: "2px dashed #c00", color: "#c00" }}>Invalid JSON for {name}: {String(err)}</div>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Component labels={labels as any} />;
}
