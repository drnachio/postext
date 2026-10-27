'use client';

// What a label tab and a title row edit (a box style's or a code listing's
// `label` and `titleStyle`), and the group edits they share.
import type { CalloutStyleConfig, ResolvedCalloutStyleConfig } from 'postext';

/** The fields a label tab and a title row share between box styles and
 *  code listings (#1170): `codeStyle.label` and `codeStyle.titleStyle`
 *  are a box style's `label` and `titleStyle`. */
export type TabHost = Pick<CalloutStyleConfig, 'label' | 'titleStyle'>;

export interface CalloutGroupFieldsProps {
  style: TabHost;
  /** `borderRadius`: the box's, which a joined tab's corners default to. */
  resolved: Pick<ResolvedCalloutStyleConfig, 'label' | 'titleStyle' | 'borderRadius'>;
  onChange: (partial: Partial<TabHost>) => void;
  onResetField: (field: keyof TabHost) => void;
  sectionId: string;
  fieldId: string;
}

/** Merge into a group, drop a field (and the group with its last field),
 *  and read whether a field is set, as the style card does. */
export function tabHostEdits({ style, onChange, onResetField }: Pick<CalloutGroupFieldsProps, 'style' | 'onChange' | 'onResetField'>) {
  const updateGroup = <G extends keyof TabHost>(group: G, partial: Partial<NonNullable<TabHost[G]>>) => {
    const current = (style[group] ?? {}) as NonNullable<TabHost[G]>;
    onChange({ [group]: { ...current, ...partial } } as Partial<TabHost>);
  };
  const resetGroupField = <G extends keyof TabHost>(group: G, field: keyof NonNullable<TabHost[G]>) => {
    const current = style[group] as NonNullable<TabHost[G]> | undefined;
    if (!current) return;
    const next: Partial<NonNullable<TabHost[G]>> = { ...current };
    delete next[field];
    if (Object.keys(next).length > 0) onChange({ [group]: next } as Partial<TabHost>);
    else onResetField(group);
  };
  const groupUnset = <G extends keyof TabHost>(group: G, field: keyof NonNullable<TabHost[G]>) => {
    const current = style[group] as Partial<NonNullable<TabHost[G]>> | undefined;
    return current === undefined || current[field] === undefined;
  };
  return { updateGroup, resetGroupField, groupUnset };
}
