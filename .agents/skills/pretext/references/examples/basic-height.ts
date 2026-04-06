import { prepare, layout } from '@chenglou/pretext';

const prepared = prepare("Your long text here... 🚀", "16px Inter");
const { height, lineCount } = layout(prepared, 400, 24);

// safely set container.style.height = `${height}px`
console.log(`Height: ${height}px, Lines: ${lineCount}`);
