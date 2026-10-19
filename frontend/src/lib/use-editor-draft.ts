'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findDrafts, sameDraft, serializeDraft, type EditorDraft, type RecoverableDraft } from './editor-draft';

interface DraftOptions {
  draft: EditorDraft;
  postId?: string;
  expectedUpdatedAt?: string;
  serverPasswordSet: boolean;
}

export function useEditorDraft({ draft, postId, expectedUpdatedAt, serverPasswordSet }: DraftOptions) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [recoverable, setRecoverable] = useState<RecoverableDraft[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [storageError, setStorageError] = useState('');
  const [savedAt, setSavedAt] = useState<number>();
  const [renderBaseline, setRenderBaseline] = useState(draft);
  const [isRetired, setIsRetired] = useState(false);
  const latest = useRef(draft);
  const baseline = useRef(draft);
  const version = useRef(expectedUpdatedAt);
  const currentKey = useRef(`post_autosave_${postId || 'new'}:${sessionId}`);
  const retired = useRef(false);
  const mounted = useRef(false);
  const recoverySource = useRef<RecoverableDraft | undefined>(undefined);
  const readFailed = useRef(false);
  const acknowledgedCleanupPending = useRef(false);
  const lastWritten = useRef<EditorDraft | undefined>(undefined);
  const isDirty = !isRetired && !sameDraft(draft, renderBaseline);
  const dirty = useRef(isDirty);

  useLayoutEffect(() => { latest.current = draft; dirty.current = !retired.current && !sameDraft(draft, baseline.current); }, [draft]);

  const reportError = useCallback((message: string) => { if (mounted.current) setStorageError(message); }, []);
  const readRecovery = useCallback(() => {
    try {
      const found = findDrafts(localStorage, postId, latest.current, serverPasswordSet).filter(item => item.key !== currentKey.current);
      setRecoverable(found);
      setSelectedKey(found[0]?.key || '');
      readFailed.current = false;
      setStorageError('');
    } catch (error) {
      readFailed.current = true;
      reportError(error instanceof Error && error.message.startsWith('本地草稿') ? error.message : '本地草稿读取失败，请检查浏览器存储权限后重试。');
    }
  }, [postId, serverPasswordSet, reportError]);

  const flush = useCallback((override?: EditorDraft, targetPostId?: string, targetVersion?: string): boolean => {
    if (retired.current) return true;
    const value = override || latest.current;
    if (sameDraft(value, baseline.current)) {
      // Undoing all edits must not leave an obsolete recovery snapshot behind.
      // Only this editor's own key is obsolete; other tabs/recovery sources stay.
      if (!lastWritten.current) return true;
      try {
        localStorage.removeItem(currentKey.current);
        lastWritten.current = undefined;
        if (mounted.current) { setSavedAt(undefined); setStorageError(''); }
        return true;
      } catch {
        reportError('本地草稿清理失败，请检查浏览器存储权限后重试。');
        return false;
      }
    }
    if (!override && lastWritten.current && sameDraft(value, lastWritten.current)) return true;
    const targetKey = targetPostId ? `post_autosave_${targetPostId}:${sessionId}` : currentKey.current;
    try {
      localStorage.setItem(targetKey, serializeDraft(value, targetVersion ?? version.current));
      if (targetKey !== currentKey.current) localStorage.removeItem(currentKey.current);
      currentKey.current = targetKey;
      lastWritten.current = value;
      if (mounted.current) { setSavedAt(Date.now()); setStorageError(''); }
      return true;
    } catch {
      reportError('本地草稿保存失败，可能是存储空间不足或权限受限。请重试或立即保存到服务器。');
      return false;
    }
  }, [sessionId, reportError]);

  useEffect(() => {
    mounted.current = true;
    readRecovery();
    const onPageHide = () => { flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (!dirty.current || retired.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    const maxWait = setInterval(onPageHide, 5000);
    return () => {
      mounted.current = false;
      flush();
      clearInterval(maxWait);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
    // Recovery is checked once for this editor instance, not after each server acknowledgement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  useEffect(() => {
    if (!isDirty) { flush(); return; }
    const timer = setTimeout(() => { flush(); }, 700);
    return () => clearTimeout(timer);
  }, [draft, isDirty, flush]);

  const setVersion = (updatedAt?: string) => { version.current = updatedAt; };
  function acknowledgeBaseline(value: EditorDraft, current: EditorDraft = latest.current) {
    baseline.current = value;
    latest.current = current;
    dirty.current = !retired.current && !sameDraft(current, value);
    if (mounted.current) setRenderBaseline(value);
  }
  function clearRecoveredSource() {
    const source = recoverySource.current;
    // A different tab may have updated the original since it was reviewed.
    // Delete only the exact snapshot this editor recovered and saved.
    if (source && localStorage.getItem(source.key) === source.raw) localStorage.removeItem(source.key);
    recoverySource.current = undefined;
  }
  function markClean(value: EditorDraft, close = false): boolean {
    acknowledgeBaseline(value, value);
    retired.current = close;
    if (mounted.current) setIsRetired(close);
    acknowledgedCleanupPending.current = true;
    setRecoverable([]);
    try {
      localStorage.removeItem(currentKey.current);
      clearRecoveredSource();
      acknowledgedCleanupPending.current = false;
      lastWritten.current = undefined;
      setSavedAt(undefined);
      setStorageError('');
      return true;
    } catch {
      retired.current = false;
      if (mounted.current) setIsRetired(false);
      reportError('文章已同步，但本地草稿清理失败，请重试清理。');
      return false;
    }
  }
  function restore(): RecoverableDraft | undefined {
    const selected = recoverable.find(item => item.key === selectedKey);
    if (!selected) return;
    recoverySource.current = selected;
    version.current = selected.expectedUpdatedAt ?? version.current;
    latest.current = selected.draft;
    dirty.current = true;
    setRecoverable([]);
    flush(selected.draft);
    return selected;
  }
  function discard() {
    const selected = recoverable.find(item => item.key === selectedKey);
    if (!selected) return;
    try {
      if (localStorage.getItem(selected.key) !== selected.raw) { readRecovery(); reportError('此草稿已在其他窗口更新，请重新选择后操作。'); return; }
      localStorage.removeItem(selected.key);
      const remaining = recoverable.filter(item => item.key !== selected.key);
      setRecoverable(remaining);
      setSelectedKey(remaining[0]?.key || '');
      setStorageError('');
    } catch { reportError('本地草稿清理失败，请检查浏览器存储权限后重试。'); }
  }
  function retry() {
    if (readFailed.current) readRecovery();
    else if (acknowledgedCleanupPending.current && !dirty.current) markClean(latest.current, retired.current);
    else if (!dirty.current) flush();
    else { lastWritten.current = undefined; flush(); }
  }

  return { latest, recoverable, selectedKey, setSelectedKey, storageError, savedAt, isDirty,
    flush, acknowledgeBaseline, markClean, setVersion, restore, discard, retry };
}
