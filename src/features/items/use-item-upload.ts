"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { uploadOriginal, type UploadCallbacks, type UploadSession } from "./item-upload-client";

export type SubmitUpload = (file: File, callbacks?: UploadCallbacks) => Promise<{ uploadId: string }>;
type Selection = { file: File; url: string; generation: number; session?: UploadSession; uploadId?: string };
export function useItemUpload(attach: (uploadId: string, isCurrent: () => boolean) => Promise<void>, submitUpload: SubmitUpload = uploadOriginal) {
  const selection = useRef<Selection | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const startedGeneration = useRef<number | null>(null);
  const [committedPreview, setCommittedPreview] = useState<{ url: string; generation: number } | null>(null);
  const [state, setState] = useState<"empty" | "uploading" | "retry" | "ready">("empty");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); if (selection.current) URL.revokeObjectURL(selection.current.url); }, []);
  async function run(current: Selection) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const isCurrent = () => selection.current === current && generation.current === current.generation && !abort.signal.aborted;
    try {
      if (!current.uploadId) {
        const result = await submitUpload(current.file, { signal: abort.signal, session: current.session, onSession: (value) => { current.session = value; } });
        if (!isCurrent()) return;
        current.uploadId = result.uploadId;
      }
      await attach(current.uploadId, isCurrent);
      if (isCurrent()) setState("ready");
    } catch (cause) {
      if (isCurrent()) { setError(cause instanceof Error ? cause.message : "照片未能上传，请重试。"); setState("retry"); }
    }
  }
  const startSelection = useEffectEvent((current: Selection) => { void run(current); });
  useEffect(() => {
    // Effects run after the image's new src has been committed to the DOM.
    // This ref survives StrictMode effect replay without mutating render state.
    const current = selection.current;
    if (current && current.generation === committedPreview?.generation && startedGeneration.current !== current.generation) {
      startedGeneration.current = current.generation;
      startSelection(current);
    }
  }, [committedPreview]);
  function select(file: File) {
    // Do this synchronously in the input handler, before any async work.
    const url = URL.createObjectURL(file);
    const previous = selection.current;
    const current = { file, url, generation: ++generation.current };
    controller.current?.abort(); selection.current = current; setCommittedPreview({ url, generation: current.generation }); setState("uploading"); setError(null);
    if (previous) URL.revokeObjectURL(previous.url);
  }
  function reset() {
    generation.current++; controller.current?.abort();
    if (selection.current) URL.revokeObjectURL(selection.current.url);
    selection.current = null; setCommittedPreview(null); setState("empty"); setError(null);
  }
  function confirmAttached(uploadId: string) {
    if (selection.current?.uploadId === uploadId) { setState("ready"); setError(null); }
  }
  return { preview: committedPreview?.url ?? null, state, error, select, reset, confirmAttached, retry: () => { if (selection.current) { setState("uploading"); setError(null); void run(selection.current); } } };
}
