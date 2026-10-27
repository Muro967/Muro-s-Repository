"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  uploadPrivateImage,
  type UploadCallbacks,
  type UploadSession,
} from "@/features/items/item-upload-client";

import {
  inspirationClient,
  type InspirationClient,
} from "./inspiration-client";
import { InspirationPhotoPicker } from "./inspiration-photo-picker";
import type { EditableInspiration, InspirationDetail, InspirationField } from "./inspiration-types";
import styles from "./inspiration.module.css";

type SubmitUpload = (
  file: File,
  kind: "inspiration",
  callbacks?: UploadCallbacks,
) => Promise<{ uploadId: string }>;

type EditorClient = Partial<Pick<InspirationClient, "read" | "create" | "update" | "aiStatus" | "analyze">>;

const empty = (): EditableInspiration => ({
  name: "",
  styleTags: [],
  colorNames: [],
  silhouettes: [],
  keyItems: [],
  combinations: [],
  formality: null,
  notes: null,
  confirmedFields: [],
});

const confirmableFields = new Set<keyof EditableInspiration>([
  "name", "styleTags", "colorNames", "silhouettes", "keyItems", "combinations", "formality",
]);

function isConfirmableField(field: keyof EditableInspiration): field is InspirationField {
  return confirmableFields.has(field);
}

function editableFrom(value: InspirationDetail): EditableInspiration {
  return {
    name: value.name,
    styleTags: value.styleTags,
    colorNames: value.colorNames,
    silhouettes: value.silhouettes,
    keyItems: value.keyItems,
    combinations: value.combinations,
    formality: value.formality,
    notes: value.notes,
    confirmedFields: value.confirmedFields,
  };
}

function split(value: string, maximum: number) {
  return [...new Set(value.split(/[/／,，、]/).map((item) => item.trim()).filter(Boolean))]
    .slice(0, maximum);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "暂时无法保存，请重试。";
}

export function InspirationEditor({
  inspirationId,
  client = inspirationClient,
  submitUpload = uploadPrivateImage,
}: {
  inspirationId?: string;
  client?: EditorClient;
  submitUpload?: SubmitUpload;
}) {
  const [form, setForm] = useState<EditableInspiration>(empty);
  const [record, setRecord] = useState<InspirationDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lists, setLists] = useState({
    styleTags: "",
    colorNames: "",
    silhouettes: "",
    keyItems: "",
    combinations: "",
  });
  const [loading, setLoading] = useState(Boolean(inspirationId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const session = useRef<UploadSession | undefined>(undefined);
  const previewReference = useRef<string | null>(null);
  const analysisController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (previewReference.current) URL.revokeObjectURL(previewReference.current);
      analysisController.current?.abort();
    };
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!inspirationId || !client.read) return;
    setLoading(true);
    setError(null);
    try {
      const value = await client.read(inspirationId, signal);
      if (signal?.aborted) return;
      setRecord(value);
      setForm(editableFrom(value));
      setLists({
        styleTags: value.styleTags.join(" / "),
        colorNames: value.colorNames.join(" / "),
        silhouettes: value.silhouettes.join(" / "),
        keyItems: value.keyItems.join(" / "),
        combinations: value.combinations.join(" / "),
      });
    } catch (caught) {
      if (!signal?.aborted) setError(message(caught));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [client, inspirationId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!inspirationId || !client.aiStatus) return;
    const controller = new AbortController();
    void client.aiStatus(controller.signal).then((status) => setAiAvailable(status.available)).catch(() => {});
    return () => controller.abort();
  }, [client, inspirationId]);

  async function analyze() {
    if (!record || !client.analyze || !client.read || analysisBusy) return;
    setAnalysisBusy(true);
    setError(null);
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    try {
      await client.analyze(record.id, controller.signal);
      for (const delay of [600, 1000, 1600, 2400, 3200]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (controller.signal.aborted) return;
        const updated = await client.read(record.id, controller.signal);
        setRecord(updated);
        setForm(editableFrom(updated));
        setLists({
          styleTags: updated.styleTags.join(" / "), colorNames: updated.colorNames.join(" / "), silhouettes: updated.silhouettes.join(" / "),
          keyItems: updated.keyItems.join(" / "), combinations: updated.combinations.join(" / "),
        });
        if (updated.analysisStatus === "ready" || updated.analysisStatus === "failed") break;
      }
    } catch (caught) { if (!controller.signal.aborted) setError(message(caught)); }
    finally { if (!controller.signal.aborted) setAnalysisBusy(false); }
  }

  function change<K extends keyof EditableInspiration>(
    field: K,
    value: EditableInspiration[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(isConfirmableField(field) ? {
        confirmedFields: [...new Set([...current.confirmedFields, field])],
      } : {}),
    }));
    setSaved(false);
    setError(null);
  }

  function changeList(
    field: keyof typeof lists,
    value: string,
  ) {
    setLists((current) => ({ ...current, [field]: value }));
    change(field, split(value, field === "styleTags" ? 3 : 12));
  }

  async function save() {
    if (busy || (!inspirationId && !file)) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      if (inspirationId) {
        if (!client.update || !record) throw new Error("灵感资料还没有加载完成。");
        const updated = await client.update(inspirationId, {
          ...form,
          expectedVersion: record.version,
        }, undefined);
        setRecord(updated);
        setForm(editableFrom(updated));
      } else {
        if (!client.create || !file) throw new Error("请先选择一张灵感图。");
        const uploaded = await submitUpload(file, "inspiration", {
          session: session.current,
          onSession: (value) => { session.current = value; },
        });
        const created = await client.create({ ...form, uploadId: uploaded.uploadId }, undefined);
        setRecord(created);
      }
      setSaved(true);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  const source = preview ?? record?.imageUrl ?? null;
  if (loading) return <p role="status" className={styles.loading}>正在打开灵感…</p>;
  return (
    <div className={styles.editor}>
      <header className={styles.editorHeading}>
        <p className={styles.eyebrow}>INSPIRATION NOTE</p>
        <h1>{inspirationId ? "编辑灵感" : "添加灵感"}</h1>
        <p>先留住喜欢的画面，再补上你看到的风格线索。</p>
      </header>

      <div className={styles.preview}>
        {source ? (
          <Image src={source} alt="灵感图预览" fill sizes="(max-width: 480px) 100vw, 440px" unoptimized />
        ) : (
          <div className={styles.previewEmpty}>
            <span aria-hidden="true">✦</span>
            <strong>把喜欢的穿搭放在这里</strong>
            <small>拍照、相册和截图都可以</small>
          </div>
        )}
      </div>
      {!inspirationId ? (
        <InspirationPhotoPicker
          disabled={busy}
          onSelect={(value) => {
            session.current = undefined;
            if (previewReference.current) URL.revokeObjectURL(previewReference.current);
            previewReference.current = URL.createObjectURL(value);
            setPreview(previewReference.current);
            setFile(value);
            setSaved(false);
            setError(null);
          }}
        />
      ) : null}

      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {record && aiAvailable ? <button className={styles.analysis} type="button" disabled={analysisBusy || busy} onClick={() => void analyze()}>{analysisBusy ? "AI 正在分析…" : record.analysisStatus === "ready" ? "重新 AI 分析" : "AI 分析灵感"}</button> : null}
        <fieldset className={styles.formCard} disabled={busy}>
          <legend className={styles.visuallyHidden}>灵感资料</legend>
          <label className={styles.field}>
            <span>名称</span>
            <input
              value={form.name}
              maxLength={80}
              placeholder="如：秋日通勤"
              onChange={(event) => change("name", event.target.value)}
            />
          </label>
          {([
            ["styleTags", "风格标签", "法式 / 极简，最多 3 个"],
            ["colorNames", "主要色系", "米白 / 灰绿"],
            ["silhouettes", "廓形", "宽松 / 高腰"],
            ["keyItems", "关键单品", "风衣 / 阔腿裤"],
            ["combinations", "组合关系", "针织衫 + 半裙"],
          ] as const).map(([field, label, placeholder]) => (
            <label className={styles.field} key={field}>
              <span>{label}</span>
              <input
                value={lists[field]}
                placeholder={placeholder}
                onChange={(event) => changeList(field, event.target.value)}
              />
            </label>
          ))}
          <label className={styles.field}>
            <span>正式程度</span>
            <input
              value={form.formality ?? ""}
              maxLength={80}
              placeholder="休闲 / 通勤 / 正式"
              onChange={(event) => change("formality", event.target.value || null)}
            />
          </label>
          <label className={`${styles.field} ${styles.notes}`}>
            <span>个人备注</span>
            <textarea
              value={form.notes ?? ""}
              maxLength={1000}
              rows={4}
              placeholder="写下真正吸引你的地方"
              onChange={(event) => change("notes", event.target.value || null)}
            />
          </label>
        </fieldset>
        <p className={styles.hint}>用 / 分隔多个词。你保存过的字段会被视为人工内容，后续 AI 不会静默覆盖。</p>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        {saved ? (
          <div role="status" className={styles.saved}>
            已保存。<Link href="/app/inspiration">返回灵感墙</Link>
          </div>
        ) : null}
        <button
          className={styles.primary}
          type="submit"
          disabled={busy || (!inspirationId && !file)}
        >
          {busy ? "正在保存…" : inspirationId ? "保存修改" : "保存灵感"}
        </button>
        {record ? <Link className={styles.recreate} href={`/app/inspiration/${record.id}/recreate`}>用我的衣服复刻</Link> : null}
      </form>
    </div>
  );
}
