"use client";

import { useEffect, useRef, useState } from "react";
import { uploadOriginal, type UploadCallbacks, type UploadSession } from "./item-upload-client";

export type SubmitUpload = (file: File, callbacks?: UploadCallbacks) => Promise<{ uploadId: string }>;
type Selection = { file: File; url: string; generation: number; session?: UploadSession; uploadId?: string };
export function useItemUpload(attach: (uploadId: string, signal: AbortSignal, isCurrent: () => boolean) => Promise<void>, submitUpload: SubmitUpload = uploadOriginal) {
  const selection = useRef<Selection | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"empty" | "uploading" | "retry" | "ready">("empty");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); if (selection.current) URL.revokeObjectURL(selection.current.url); }, []);
  async function run(current: Selection) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const isCurrent = () => selection.current === current && generation.current === current.generation && !abort.signal.aborted;
    setState("uploading"); setError(null);
    try {
      if (!current.uploadId) {
        const result = await submitUpload(current.file, { signal: abort.signal, session: current.session, onSession: (value) => { current.session = value; } });
        if (!isCurrent()) return;
        current.uploadId = result.uploadId;
      }
      await attach(current.uploadId, abort.signal, isCurrent);
      if (isCurrent()) setState("ready");
    } catch (cause) {
      if (isCurrent()) { setError(cause instanceof Error ? cause.message : "照片未能上传，请重试。"); setState("retry"); }
    }
  }
  function select(file: File) {
    // Do this synchronously in the input handler, before any async work.
    const url = URL.createObjectURL(file);
    const previous = selection.current;
    const current = { file, url, generation: ++generation.current };
    controller.current?.abort(); selection.current = current; setPreview(url);
    if (previous) URL.revokeObjectURL(previous.url);
    void run(current);
  }
  function reset() {
    generation.current++; controller.current?.abort();
    if (selection.current) URL.revokeObjectURL(selection.current.url);
    selection.current = null; setPreview(null); setState("empty"); setError(null);
  }
  return { preview, state, error, select, reset, retry: () => { if (selection.current) void run(selection.current); } };
}
