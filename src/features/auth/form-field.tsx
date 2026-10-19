import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import type { ClientError } from "./auth-client";
import styles from "./auth-form.module.css";

export function FormField({ label, error, hint, children, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & { label: string; error?: string; hint?: string; children?: (props: { id: string; className: string; required: boolean; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return <div className={styles.field}>
    <label className={styles.label} htmlFor={id}>{label}</label>
    {children ? children({ id, className: styles.input, required: !!props.required, "aria-invalid": !!error, "aria-describedby": describedBy }) : <input {...props} id={id} className={styles.input} aria-invalid={!!error} aria-describedby={describedBy} />}
    {error ? <p id={`${id}-error`} className={styles.error}>{error}</p> : hint ? <p id={`${id}-hint`} className={styles.hint}>{hint}</p> : null}
  </div>;
}
export function FormError({ error }: { error: ClientError | null }) {
  if (!error) return null;
  return <div role="alert" className={styles.alert}><p>{error.message}</p>{error.code === "UNAUTHORIZED" ? <Link href="/login">重新登录</Link> : null}</div>;
}
