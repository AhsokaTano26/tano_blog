'use client';

import { createContext, useContext } from 'react';

export interface EntryAnimationConfig {
  overrides: Record<string, string>;
  icon_data_url: string;
}

export interface EntryAnimationSettings extends EntryAnimationConfig {
  site_title: string;
  warning?: string;
  fields: {
    key: string;
    group: string;
    label: string;
    default: string;
    max_length: number;
    multiline?: boolean;
  }[];
}

export interface EntryAnimationDocument {
  html: string;
  duration_ms: number;
}

export const EntryAnimationPreviewContext = createContext<((document: EntryAnimationDocument) => void) | null>(null);
export const useEntryAnimationPreview = () => useContext(EntryAnimationPreviewContext);
