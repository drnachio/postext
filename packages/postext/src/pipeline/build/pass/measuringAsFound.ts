// What a pass sets for its own measuring, put back when it ends.
import { setSymbolFont, symbolFont } from '../../../measure/font.js';
import { getCjkLineBreak, setCjkLineBreak } from '../../../measure/cjk/cjkClasses.js';
import { getSlashBreaks, setSlashBreaks } from '../../../measure/breakRules.js';
import { getCjkComposition, setCjkComposition } from '../../../measure/cjk/cjkPunctuation.js';
import { getMeasureWritingMode, getMeasureRegion, getMeasureUprightDigits, setMeasureWritingMode, setMeasureUprightDigits } from '../../../measure/vertical.js';
import { getMeasureDirection, getMeasureArabicNumbers, setMeasureArabicNumbers, setMeasureDirection } from '../../../measure/rtl/bidiLines.js';
import { getMeasureScriptContext, setMeasureScriptContext } from '../../../measure/script.js';
import { getMeasureLanguage, setMeasureLanguage } from '../../../measure/canvas.js';
import { setColumnObstacleSource } from '../../floats/textWrap.js';

/**
 * Run `pass`, which sets the CJK line-break level, the CJK composition and
 * the writing mode text is measured in for its own measuring, and the
 * symbol font every font string lists (#1460); what the caller had in
 * force is put back when it ends, also when it throws (a cancelled build),
 * so text measured outside a build reads as it did before it.
 */
export function withMeasuringAsFound<T>(pass: () => T): T {
  const lineBreak = getCjkLineBreak();
  const composition = getCjkComposition();
  const writingMode = getMeasureWritingMode();
  const region = getMeasureRegion();
  const uprightDigits = getMeasureUprightDigits();
  const direction = getMeasureDirection();
  const arabicNumbers = getMeasureArabicNumbers();
  const scriptContext = getMeasureScriptContext();
  const language = getMeasureLanguage();
  const slashBreaks = getSlashBreaks();
  const symbols = symbolFont();
  const obstacles = setColumnObstacleSource(undefined);
  try {
    return pass();
  } finally {
    setColumnObstacleSource(obstacles);
    setSymbolFont(symbols);
    setSlashBreaks(slashBreaks);
    setMeasureLanguage(language);
    setMeasureScriptContext(scriptContext);
    setMeasureArabicNumbers(arabicNumbers);
    setCjkLineBreak(lineBreak);
    setCjkComposition(composition);
    setMeasureWritingMode(writingMode, region);
    setMeasureUprightDigits(uprightDigits);
    setMeasureDirection(direction);
  }
}
