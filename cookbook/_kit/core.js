// ─── Kit · core v1 ── the same in every recipe · postext.dev/cookbook ─────────
function mm(value) { return { value, unit: 'mm' }; }
function pt(value) { return { value, unit: 'pt' }; }
function em(value) { return { value, unit: 'em' }; }
/** The sample language's string: t({ en: 'Figure', es: 'Figura' }). */
function t(strings) { return strings[LANG] ?? Object.values(strings)[0]; }
/** A file in this recipe's assets folder, served from the Postext repo by jsDelivr. */
function asset(file) { return `https://cdn.jsdelivr.net/gh/drnachio/postext@main/cookbook/${RECIPE}/assets/${file}`; }
