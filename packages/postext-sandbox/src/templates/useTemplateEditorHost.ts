import { useEffect } from 'react';
import { useDesignDispatch, useSandboxDispatch, useSandboxStateGetter } from '../context/SandboxContext.js';
import { setTemplateEditorHost } from './editorStore.js';

/** Lends the page-template editor of the canvas (#863) the book's state
 *  and dispatch while the canvas is mounted. */
export function useTemplateEditorHost(): void {
  const getState = useSandboxStateGetter();
  const dispatch = useSandboxDispatch();
  const writeDesign = useDesignDispatch();
  useEffect(() => {
    setTemplateEditorHost({ getState, dispatch, writeDesign });
    return () => setTemplateEditorHost(null);
  }, [getState, dispatch, writeDesign]);
}
