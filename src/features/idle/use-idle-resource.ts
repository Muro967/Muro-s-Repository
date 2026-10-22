"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { calendarDate } from "../items/item-lifecycle";

export function useIdleResource<T>(load: (signal: AbortSignal) => Promise<T>, getTimeZone?: (data: T) => string) {
  const [state, setState] = useState<{ data?: T; error?: string; revision: number }>({ revision: -1 });
  const [revision, setRevision] = useState(0); const generation = useRef(0);
  const inFlight = useRef(false); const queued = useRef(false); const lastAutomatic = useRef(-Infinity);
  const mounted = useRef(false); const pendingAutomatic = useRef(false);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const calendar = useRef<{ timeZone: string; observedDate: string } | null>(null);
  const flushAutomatic = useCallback(function flush() {
    if (!mounted.current || !pendingAutomatic.current || document.visibilityState !== "visible" || inFlight.current || queued.current) return;
    const wait = 1000 - (Date.now() - lastAutomatic.current);
    if (wait > 0) {
      throttleTimer.current ??= setTimeout(() => { throttleTimer.current = undefined; flush(); }, wait);
      return;
    }
    clearTimeout(throttleTimer.current); throttleTimer.current = undefined;
    pendingAutomatic.current = false; queued.current = true; lastAutomatic.current = Date.now();
    // A date transition is consumed only when its refresh is actually admitted.
    if (calendar.current) calendar.current.observedDate = calendarDate(new Date(), calendar.current.timeZone);
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    const id = ++generation.current; const controller = new AbortController();
    const startedAt = new Date();
    inFlight.current = true; queued.current = false; pendingAutomatic.current = false;
    clearTimeout(throttleTimer.current); throttleTimer.current = undefined;
    if (calendar.current) calendar.current.observedDate = calendarDate(startedAt, calendar.current.timeZone);
    load(controller.signal).then((data) => {
      if (controller.signal.aborted || id !== generation.current) return;
      if (getTimeZone) {
        const timeZone = getTimeZone(data);
        // The response can describe the date at request start. Advancing this
        // baseline at completion could hide a midnight crossed in flight.
        calendar.current = { timeZone, observedDate: calendarDate(startedAt, timeZone) };
      }
      setState({ data, revision });
    }).catch(() => { if (!controller.signal.aborted && id === generation.current) setState((old) => ({ data: old.data, revision, error: "资料加载失败，请重试。" })); })
      .finally(() => {
        if (controller.signal.aborted || id !== generation.current) return;
        inFlight.current = false;
        if (calendar.current && calendarDate(new Date(), calendar.current.timeZone) !== calendar.current.observedDate) pendingAutomatic.current = true;
        flushAutomatic();
      });
    return () => { controller.abort(); };
  }, [load, revision, getTimeZone, flushAutomatic]);
  useEffect(() => {
    mounted.current = true;
    function refresh() {
      if (document.visibilityState !== "visible" || queued.current) return;
      pendingAutomatic.current = true;
      flushAutomatic();
    }
    const timer = getTimeZone ? setInterval(() => {
      const current = calendar.current;
      if (!current || document.visibilityState !== "visible") return;
      const today = calendarDate(new Date(), current.timeZone);
      if (today === current.observedDate) return;
      refresh();
    }, 60_000) : undefined;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted.current = false; pendingAutomatic.current = false;
      clearInterval(timer);
      clearTimeout(throttleTimer.current); throttleTimer.current = undefined;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [getTimeZone, flushAutomatic]);
  return { data: state.data, error: state.error, loading: state.revision !== revision, reload: () => setRevision((value) => value + 1) };
}
