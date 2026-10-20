"use client";
import { useEffect, useRef, useState } from "react";

export function useIdleResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: string; revision: number }>({ revision: -1 });
  const [revision, setRevision] = useState(0); const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current; const controller = new AbortController();
    load(controller.signal).then((data) => { if (!controller.signal.aborted && id === generation.current) setState({ data, revision }); })
      .catch(() => { if (!controller.signal.aborted && id === generation.current) setState((old) => ({ data: old.data, revision, error: "资料加载失败，请重试。" })); });
    return () => controller.abort();
  }, [load, revision]);
  return { data: state.data, error: state.error, loading: state.revision !== revision, reload: () => setRevision((value) => value + 1) };
}
