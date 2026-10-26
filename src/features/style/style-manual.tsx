"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { StyleProfile } from "./style-repository";
import type { StyleRule } from "./style-types";
import styles from "./style-manual.module.css";

type StyleRead = {
  validCount: number;
  remaining: number;
  current: StyleProfile | null;
  rules: StyleRule[];
};

type Draft = {
  preferredColors: string;
  preferredSilhouettes: string;
  commonCombinations: string;
  formalityTendency: string;
  likedExamples: string;
};

const emptyDraft: Draft = {
  preferredColors: "",
  preferredSilhouettes: "",
  commonCombinations: "",
  formalityTendency: "",
  likedExamples: "",
};

function draftFromProfile(profile: StyleProfile | null): Draft {
  if (!profile) return emptyDraft;
  return {
    preferredColors: profile.preferredColors.join("、"),
    preferredSilhouettes: profile.preferredSilhouettes.join("、"),
    commonCombinations: profile.commonCombinations.join("、"),
    formalityTendency: profile.formalityTendency ?? "",
    likedExamples: profile.likedExamples.join("、"),
  };
}

function splitList(value: string) {
  return [...new Set(value.split(/[、,，\n]/).map((part) => part.trim()).filter(Boolean))];
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  const value = await response.json().catch(() => null) as T | null;
  if (!response.ok || value === null) throw new Error("暂时无法保存，请稍后再试。");
  return value;
}

export function StyleManual() {
  const [style, setStyle] = useState<StyleRead | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [newRule, setNewRule] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{ style: StyleRead }>("/api/style-profile");
      setStyle(response.style);
      setDraft(draftFromProfile(response.style.current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时无法读取风格说明书。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "暂时无法保存，请稍后再试。"); }
    finally { setBusy(false); }
  };

  const updateCurrent = (current: StyleProfile) => {
    setStyle((previous) => previous ? { ...previous, current } : previous);
    setDraft(draftFromProfile(current));
  };

  const save = () => run(async () => {
    if (!style?.current) return;
    const response = await request<{ style: StyleProfile }>("/api/style-profile", "PUT", {
      expectedUpdatedAt: style.current.updatedAt,
      preferredColors: splitList(draft.preferredColors),
      preferredSilhouettes: splitList(draft.preferredSilhouettes),
      commonCombinations: splitList(draft.commonCombinations),
      formalityTendency: draft.formalityTendency.trim() || null,
      likedExamples: splitList(draft.likedExamples),
    });
    updateCurrent(response.style);
  });

  const regenerate = () => run(async () => {
    const response = await request<{ style: Omit<StyleRead, "rules"> }>("/api/style-profile", "POST", {});
    setStyle((previous) => previous ? { ...previous, ...response.style } : { ...response.style, rules: [] });
    setDraft(draftFromProfile(response.style.current));
  });

  const acceptSuggestion = () => run(async () => {
    if (!style?.current) return;
    const response = await request<{ style: StyleProfile }>("/api/style-profile", "PUT", {
      action: "accept-suggestion",
      expectedUpdatedAt: style.current.updatedAt,
    });
    updateCurrent(response.style);
  });

  const createRule = () => run(async () => {
    const value = newRule.trim();
    if (!value) return;
    const response = await request<{ rule: StyleRule }>("/api/style-rules", "POST", {
      type: "text",
      value,
      enabled: true,
    });
    setStyle((previous) => previous ? { ...previous, rules: [...previous.rules, response.rule] } : previous);
    setNewRule("");
  });

  const toggleRule = (rule: StyleRule) => run(async () => {
    const response = await request<{ rule: StyleRule }>(`/api/style-rules/${rule.id}`, "PATCH", {
      expectedUpdatedAt: rule.updatedAt,
      enabled: !rule.enabled,
    });
    setStyle((previous) => previous ? {
      ...previous,
      rules: previous.rules.map((candidate) => candidate.id === rule.id ? response.rule : candidate),
    } : previous);
  });

  const deleteRule = (rule: StyleRule) => run(async () => {
    await request<{ ok: true }>(`/api/style-rules/${rule.id}`, "DELETE", {
      expectedUpdatedAt: rule.updatedAt,
    });
    setStyle((previous) => previous ? {
      ...previous,
      rules: previous.rules.filter((candidate) => candidate.id !== rule.id),
    } : previous);
  });

  if (loading) return <p role="status" className={styles.status}>正在整理你的风格说明书…</p>;
  if (!style) return <div role="alert" className={styles.error}>{error ?? "暂时无法读取风格说明书。"}<button onClick={() => void load()}>重试</button></div>;
  if (style.remaining > 0) return (
    <section className={styles.threshold}>
      <p className={styles.eyebrow}>STYLE MANUAL</p>
      <h1>还差 {style.remaining} 张有效灵感</h1>
      <p>有效灵感需要至少有风格或颜色信息。收集满 5 张后，我会开始整理共同偏好。</p>
      <Link href="/app/inspiration">返回灵感墙</Link>
    </section>
  );
  if (!style.current) return (
    <section className={styles.threshold}>
      <p className={styles.eyebrow}>STYLE MANUAL</p>
      <h1>灵感已经足够了</h1>
      <p>先用明确的规则整理一版，之后也可以随时自己修改。</p>
      {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
      <button className={styles.primary} disabled={busy} onClick={() => void regenerate()}>整理说明书</button>
    </section>
  );

  return (
    <section className={styles.manual}>
      <header>
        <p className={styles.eyebrow}>YOUR STYLE, IN YOUR WORDS</p>
        <h1>你的风格说明书</h1>
        <p>这是可以修改的生活档案，不是固定标签。</p>
      </header>

      {style.current.pendingSuggestion ? (
        <aside className={styles.suggestion}>
          <div><strong>有新的整理建议</strong><span>原有人工版本没有被覆盖</span></div>
          <button disabled={busy} onClick={() => void acceptSuggestion()}>采用建议</button>
        </aside>
      ) : null}

      <div className={styles.sections}>
        <label><span>偏爱色系</span><textarea aria-label="偏爱色系" value={draft.preferredColors} onChange={(event) => setDraft({ ...draft, preferredColors: event.target.value })} /></label>
        <label><span>偏爱廓形</span><textarea aria-label="偏爱廓形" value={draft.preferredSilhouettes} onChange={(event) => setDraft({ ...draft, preferredSilhouettes: event.target.value })} /></label>
        <label><span>常用组合</span><textarea aria-label="常用组合" value={draft.commonCombinations} onChange={(event) => setDraft({ ...draft, commonCombinations: event.target.value })} /></label>
        <label><span>正式程度</span><input aria-label="正式程度" value={draft.formalityTendency} onChange={(event) => setDraft({ ...draft, formalityTendency: event.target.value })} /></label>
        <label><span>喜欢示例</span><textarea aria-label="喜欢示例" value={draft.likedExamples} onChange={(event) => setDraft({ ...draft, likedExamples: event.target.value })} /><small>保留在说明书里的灵感编号，最多 3 个</small></label>
      </div>
      {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
      <button className={styles.primary} disabled={busy} onClick={() => void save()}>保存说明书</button>

      <section className={styles.dislikes} aria-labelledby="dislikes-heading">
        <header><div><p className={styles.eyebrow}>BOUNDARIES</p><h2 id="dislikes-heading">不喜欢</h2></div><span>{style.rules.length} 条</span></header>
        <div className={styles.ruleComposer}>
          <label><span>新增不喜欢规则</span><input aria-label="新增不喜欢规则" value={newRule} onChange={(event) => setNewRule(event.target.value)} placeholder="例如：不要豹纹" /></label>
          <button disabled={busy || !newRule.trim()} onClick={() => void createRule()}>添加规则</button>
        </div>
        <div className={styles.ruleList}>
          {style.rules.map((rule) => <article key={rule.id} data-enabled={rule.enabled}>
            <p>{rule.value}</p>
            <div><button disabled={busy} aria-label={`${rule.enabled ? "停用" : "启用"}${rule.value}`} onClick={() => void toggleRule(rule)}>{rule.enabled ? "停用" : "启用"}</button><button disabled={busy} aria-label={`删除${rule.value}`} onClick={() => void deleteRule(rule)}>删除</button></div>
          </article>)}
          {style.rules.length === 0 ? <p className={styles.empty}>还没有限制。只记录你真正介意的部分。</p> : null}
        </div>
      </section>
    </section>
  );
}
