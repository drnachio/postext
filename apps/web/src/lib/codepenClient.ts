/**
 * Browser side of CodePen's "POST to prefill editors" API
 * (https://blog.codepen.io/documentation/prefill/). The prefill JSON comes
 * from `penDefineData` (docs examples) or `defineData` (Cookbook recipes).
 */

const CODEPEN_DEFINE = "https://codepen.io/pen/define";

/** Opens a new pen prefilled with `data` (CodePen's "POST to prefill
 *  editors" JSON) in a popup window, or a new tab when popups are blocked. */
export function openInCodePen(data: string, windowName: string) {
  const width = Math.min(1280, window.screen.availWidth - 80);
  const height = Math.min(860, window.screen.availHeight - 80);
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  const popup = window.open("", windowName, `popup,width=${width},height=${height},left=${left},top=${top}`);
  // The pen must not be able to navigate this page.
  if (popup) popup.opener = null;

  const form = document.createElement("form");
  form.action = CODEPEN_DEFINE;
  form.method = "POST";
  form.target = popup ? windowName : "_blank";
  form.hidden = true;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "data";
  input.value = data;
  form.append(input);
  document.body.append(form);
  form.submit();
  form.remove();
}
