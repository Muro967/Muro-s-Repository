"use client";
import { useEffect, useRef, useState } from "react";
import { calendarDate } from "../items/item-lifecycle";

export function useIdleResource<T>(load: (signal: AbortSignal) => Promise<T>, getTimeZone?: (data: T) => string) {
  const [state, setState] = useState<{ data?: T; error?: string; revision: number }>({ revision: -1 });
  const [revision, setRevision] = useState(0); const generation = useRef(0);
  const inFlight = useRef(false); const queued = useRef(false); const lastAutomatic = useRef(-Infinity);
  const calendar = useRef<{ timeZone: string; observedDate: string } | null>(null);
  useEffect(() => {
    const id = ++generation.current; const controller = new AbortController();
    inFlight.current = true; queued.current = false;
    load(controller.signal).then((data) => {
      if (controller.signal.aborted || id !== generation.current) return;
      if (getTimeZone) {
        const timeZone = getTimeZone(data);
        // Observe clock transitions, rather than repeatedly comparing a skewed
        // client clock with server today. Rendered dates remain server-owned.
        calendar.current = { timeZone, observedDate: calendarDate(new Date(), timeZone) };
      }
      setState({ data, revision });
    }).catch(() => { if (!controller.signal.aborted && id === generation.current) setState((old) => ({ data: old.data, revision, error: "资料加载失败，请重试。" })); })
      .finally(() => { if (id === generation.current) inFlight.current = false; });
    return () => { controller.abort(); };
  }, [load, revision, getTimeZone]);
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible" || inFlight.current || queued.current || Date.now() - lastAutomatic.current < 1000) return;
      lastAutomatic.current = Date.now(); queued.current = true;
      setRevision((value) => value + 1);
    }
    const timer = getTimeZone ? setInterval(() => {
      const current = calendar.current;
      if (!current || document.visibilityState !== "visible" || inFlight.current || queued.current) return;
      const today = calendarDate(new Date(), current.timeZone);
      if (today === current.observedDate) return;
      // One attempt per observed date, including failures. Focus or an explicit
      // retry can recover without creating a once-per-minute failure loop.
      current.observedDate = today;
      refresh();
    }, 60_000) : undefined;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [getTimeZone]);
  return { data: state.data, error: state.error, loading: state.revision !== revision, reload: () => setRevision((value) => value + 1) };
}
