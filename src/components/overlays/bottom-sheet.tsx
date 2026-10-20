"use client";

import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import styles from "./bottom-sheet.module.css";

const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function restoreFocus(element: HTMLElement | null) {
  if (!element?.isConnected || element.matches(":disabled") || element.closest("[hidden], [inert]") || !element.matches(`${focusableSelector}, [tabindex="-1"]`)) return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  element.focus();
  return document.activeElement === element;
}

export function BottomSheet({ open, title, description, onClose, fallbackFocusRef, children }: { open: boolean; title: string; description?: string; onClose: () => void; fallbackFocusRef?: RefObject<HTMLElement | null>; children: ReactNode }) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const focusOrigin = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });
  useLayoutEffect(() => {
    if (!open || !panel.current || !overlay.current) return;
    // StrictMode may replay this effect after focus has already entered the panel.
    // Keep the outside opening control instead of capturing our own close button.
    if (!panel.current.contains(document.activeElement)) focusOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const trigger = focusOrigin.current;
    const fallback = fallbackFocusRef?.current ?? null;
    const overflow = document.body.style.overflow;
    const background = Array.from(document.body.children).filter((element) => element !== overlay.current).map((element) => ({ element, inert: element.getAttribute("inert"), hidden: element.getAttribute("aria-hidden") }));
    for (const { element } of background) { element.setAttribute("inert", ""); element.setAttribute("aria-hidden", "true"); }
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter((element) => !element.hidden && !element.closest('[hidden], [inert]'))
      .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    (panel.current.querySelector<HTMLElement>("[data-sheet-autofocus]") ?? focusable()[0] ?? panel.current).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0]; const last = controls.at(-1);
      if (!first) { event.preventDefault(); panel.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const keepFocus = (event: FocusEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target)) (focusable()[0] ?? panel.current)?.focus(); };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", keepFocus);
      document.body.style.overflow = overflow;
      for (const { element, inert, hidden } of background) {
        if (inert === null) element.removeAttribute("inert"); else element.setAttribute("inert", inert);
        if (hidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", hidden);
      }
      queueMicrotask(() => { if (!restoreFocus(trigger)) restoreFocus(fallback); });
    };
  }, [open, fallbackFocusRef]);
  useLayoutEffect(() => {
    if (open && panel.current) (panel.current.querySelector<HTMLElement>("[data-sheet-autofocus]") ?? panel.current.querySelector<HTMLElement>(focusableSelector) ?? panel.current).focus();
  }, [open, title]);
  if (!open) return null;
  return createPortal(<div className={styles.backdrop} ref={overlay} data-testid="sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} tabIndex={-1}>
      <div className={styles.heading}><h2 id={`${id}-title`}>{title}</h2><button type="button" onClick={onClose} aria-label={`关闭${title}`}>×</button></div>
      {description && <p className={styles.description} id={`${id}-description`}>{description}</p>}
      {children}
    </section>
  </div>, document.body);
}
