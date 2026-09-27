import { URL_KEYS } from "./model";

/** Set on `<html>` while the gallery shows results instead of the book view.
 *  CSS keys off it (cookbook.css), so a deep link never flashes the book. */
export const FILTERED_ATTR = "data-cb-filtered";

/** Inline script emitted by the root layout (never rendered on the client, so
 *  React does not warn about it): on the gallery's path it marks `<html>`
 *  filtered when the URL carries any key of the grammar, before the first
 *  paint. The filters island keeps the attribute in sync and removes it on
 *  unmount (`<html>` survives client navigation). */
export const PREPAINT_SCRIPT = `(function(){try{if(!/^\\/[a-z]{2}\\/cookbook\\/?$/.test(location.pathname))return;var p=new URLSearchParams(location.search),k=${JSON.stringify(
  URL_KEYS,
)},d=document.documentElement;for(var i=0;i<k.length;i++){if(p.get(k[i])){d.setAttribute(${JSON.stringify(
  FILTERED_ATTR,
)},"");return}}d.removeAttribute(${JSON.stringify(FILTERED_ATTR)})}catch(e){}})();`;
