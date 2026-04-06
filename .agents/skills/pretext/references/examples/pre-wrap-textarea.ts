import { prepare, layout } from '@chenglou/pretext';

const textareaValue = "Multi-line\ntextarea content\ngoes here";
const textareaWidth = 300;

const prepared = prepare(textareaValue, "16px Inter", { whiteSpace: "pre-wrap" });
const { height } = layout(prepared, textareaWidth, 24);

console.log(`Textarea height: ${height}px`);
