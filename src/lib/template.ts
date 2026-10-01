import { FOUNDERS } from '../data/founders';
import { TOPIC_BY_SIGNAL } from '../data/templates';
import type { Lead } from '../state/types';

export type VariableKey = 'vorname' | 'firma' | 'stelle' | 'thema' | 'grussformel';

export interface TemplateVariable {
  key: VariableKey;
  label: string;
  value: string;
}

const LABELS: Record<VariableKey, string> = {
  vorname: 'Vorname',
  firma: 'Firma',
  stelle: 'Stelle',
  thema: 'Thema',
  grussformel: 'Grußformel',
};

export function variablesForLead(lead: Lead): TemplateVariable[] {
  const values: Record<VariableKey, string> = {
    vorname: lead.firstName,
    firma: lead.company,
    stelle: lead.signal.type === 'hiring' ? lead.signal.role : '',
    thema: TOPIC_BY_SIGNAL[lead.signal.type],
    grussformel: FOUNDERS[lead.owner].greeting,
  };
  return (Object.keys(values) as VariableKey[])
    .filter((key) => values[key])
    .map((key) => ({ key, label: LABELS[key], value: values[key] }));
}

export function fillTemplate(template: string, variables: TemplateVariable[]): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const variable = variables.find((v) => v.key === key);
    return variable ? variable.value : match;
  });
}

export interface HighlightRange {
  start: number;
  end: number;
  key: VariableKey;
}

/** Findet die eingesetzten Variablenwerte im (ggf. bearbeiteten) Text. */
export function findHighlights(text: string, variables: TemplateVariable[]): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  for (const variable of variables) {
    let from = 0;
    while (variable.value) {
      const index = text.indexOf(variable.value, from);
      if (index === -1) break;
      ranges.push({ start: index, end: index + variable.value.length, key: variable.key });
      from = index + variable.value.length;
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: HighlightRange[] = [];
  let cursor = -1;
  for (const range of ranges) {
    if (range.start >= cursor) {
      result.push(range);
      cursor = range.end;
    }
  }
  return result;
}
