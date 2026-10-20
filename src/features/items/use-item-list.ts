"use client";
import { useEffect, useRef, useState } from "react";
import { browserResponseSchema, type BrowserResponse } from "./item-browser-contract";

export function useItemList(query: string, delay = 0, revision = 0) {
 const [state, setState] = useState<{ query: string; revision: number; data?: BrowserResponse; error?: string }>({ query: "", revision: -1 });
 const generation = useRef(0);
 useEffect(() => {
  const id = ++generation.current; const controller = new AbortController();
  const timer = setTimeout(async () => {
   try {
    const response = await fetch(`/api/items?${query}`, { signal: controller.signal });
    if (!response.ok) throw new Error();
    const data = browserResponseSchema.parse(await response.json());
    if (generation.current === id && !controller.signal.aborted) setState({ query, revision, data });
   } catch {
    if (generation.current === id && !controller.signal.aborted) setState({ query, revision, error: "衣物加载失败，请重试。" });
   }
  }, delay);
  return () => { controller.abort(); clearTimeout(timer); };
 }, [query, delay, revision]);
 const current = state.query === query && state.revision === revision;
 return { data: current ? state.data : undefined, error: current ? state.error : undefined, loading: !current };
}
