"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { BottomSheet } from "@/components/overlays/bottom-sheet";
import type { DisposalInput, DisposalMethod } from "./idle-repository";
import { currencyCodes, disposalChoices, moneyToMinor } from "./idle-client";
import styles from "./idle-dashboard.module.css";

export function DisposalSheet({ item, today, submit, onClose, fallbackFocusRef }: { item: { id: string; name: string }; today: string; submit: (input: DisposalInput) => Promise<unknown>; onClose: () => void; fallbackFocusRef?: RefObject<HTMLElement | null> }) {
  const [method, setMethod] = useState<DisposalMethod | "">(""); const [amount, setAmount] = useState(""); const [currency, setCurrency] = useState("CNY");
  const [platform, setPlatform] = useState(""); const [recipient, setRecipient] = useState(""); const [date, setDate] = useState(today); const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const locked = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const choice = disposalChoices.find(({ id }) => id === method);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!method || locked.current) return;
    setError(""); let input: DisposalInput;
    try {
      input = { method, disposedOn: date, ...(notes ? { notes } : {}) };
      if (method === "sold") { if (amount.trim()) Object.assign(input, { saleAmountMinor: moneyToMinor(amount.trim(), currency), currency }); if (platform.trim()) input.platform = platform.trim(); }
      if (method === "gifted" && recipient.trim()) input.recipient = recipient.trim();
    } catch (error) { setError(error instanceof Error ? error.message : "请检查售价。"); return; }
    locked.current = true; setPending(true);
    try { await submit(input); }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "没有保存，请重试"); }
    finally { locked.current = false; if (mounted.current) setPending(false); }
  }
  return <BottomSheet open title={`处置「${item.name}」`} description="选择处置方式，会记入已处置并计算处置率。" onClose={() => { if (!locked.current) onClose(); }} fallbackFocusRef={fallbackFocusRef}>
    <form className={styles.form} onSubmit={save} aria-busy={pending}>
      <fieldset className={styles.methods} disabled={pending}><legend className={styles.srOnly}>处置方式</legend>{disposalChoices.map((option) => <label className={styles.method} key={option.id}>
        <input type="radio" name="disposal-method" value={option.id} checked={method === option.id} onChange={() => setMethod(option.id)} />
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}</fieldset>
      <fieldset className={styles.fields} disabled={pending}><legend className={styles.srOnly}>处置资料</legend>
        {method === "sold" && <><div className={styles.moneyFields}><label>售价（选填）<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00" /></label><label>币种<select value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencyCodes.map((code) => <option key={code}>{code}</option>)}</select></label></div><label>平台（选填）<input value={platform} onChange={(e) => setPlatform(e.target.value)} maxLength={120} placeholder="闲鱼、转转或线下" /></label><div className={styles.platforms}>{["闲鱼", "转转", "线下"].map((name) => <button type="button" key={name} aria-pressed={platform === name} onClick={() => setPlatform(platform === name ? "" : name)}>{name}</button>)}</div></>}
        {method === "gifted" && <label>送给谁（选填）<input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={120} placeholder="记住这份心意" /></label>}
        <label>处置日期<input type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>备注（选填）<textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="留下一点记录" /></label>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} disabled={!method || pending}>{pending ? "正在保存…" : choice ? `确认：${choice.label}` : "请选择处置方式"}</button>
      <p className={styles.hint} role="status">{pending ? "正在保存处置记录，请稍候。" : ""}</p>
    </form>
  </BottomSheet>;
}
