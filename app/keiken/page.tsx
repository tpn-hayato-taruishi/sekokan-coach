'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  EXAM_LIST,
  KEIKEN_FIELDS,
  type ExamId,
  type KeikenMode,
} from '@/lib/keiken';

type ModeMeta = { mode: KeikenMode; label: string; desc: string; icon: string };

const MODES: ModeMeta[] = [
  { mode: 'colleague', label: '同僚に確認', desc: '当時の工事内容を同僚に確認するメッセージを作成', icon: '✉️' },
  { mode: 'ctable', label: 'C票 記載内容', desc: '実務経験証明書（願書）の各欄に書く内容を整形', icon: '📄' },
  { mode: 'essay', label: '経験記述ドラフト', desc: '第二次検定 経験記述の下書きを生成', icon: '📝' },
  { mode: 'check', label: '適合チェック', desc: '実務経験・記述が認められるか自己採点', icon: '✅' },
];

const STORAGE_KEY = 'keiken_inputs_v1';

export default function KeikenPage() {
  const [examId, setExamId] = useState<ExamId>('denki_1');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<KeikenMode | null>(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 入力の永続化（本人の工事情報をブラウザに保持）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // SSRハイドレーション整合のため、復元はマウント後に行う（lazy initだと不一致になる）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.inputs) setInputs(parsed.inputs);
        if (parsed.examId) setExamId(parsed.examId);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ inputs, examId }));
    } catch { /* ignore */ }
  }, [inputs, examId]);

  const setField = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const missingRequired = KEIKEN_FIELDS.filter((f) => f.required && !(inputs[f.key] || '').trim());

  const run = async (m: KeikenMode) => {
    if (loading) return;
    setMode(m);
    setResult('');
    setError('');
    setCopied(false);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/keiken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, exam: examId, inputs }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || '生成に失敗しました。');
        setLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setResult(acc);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <header className="mb-5 border-b-2 border-sky-600 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">経験記述 ＆ 実務経験サポート</h1>
              <p className="mt-1 text-sm text-slate-600">第二次検定の経験記述・願書C票・同僚確認を、あなたの実際の工事情報から作成</p>
            </div>
            <Link href="/" className="shrink-0 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-100">← 演習に戻る</Link>
          </div>
        </header>

        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <strong>本人の実際の実務に基づいて使ってください。</strong> 本ツールは、あなたが実際に従事した工事の情報を、試験・願書の様式に整えて表現・確認する支援です。存在しない工事や従事していない立場を創作するものではありません。C票（実務経験証明書）は受験資格を左右する公式書類で、虚偽記載は受験停止・合格取消の対象です。
        </div>

        {/* 試験区分 */}
        <section className="mb-4">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">試験区分</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EXAM_LIST.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setExamId(e.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  examId === e.id
                    ? 'border-sky-600 bg-sky-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400'
                }`}
              >
                {e.short}
              </button>
            ))}
          </div>
        </section>

        {/* 入力フォーム */}
        <section className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">工事情報（実際に従事した内容）</h2>
          <div className="grid gap-3">
            {KEIKEN_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  {f.label}
                  {f.required && <span className="rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-600">必須</span>}
                </label>
                {f.multiline ? (
                  <textarea
                    value={inputs[f.key] || ''}
                    onChange={(ev) => setField(f.key, ev.target.value)}
                    placeholder={f.placeholder}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                ) : (
                  <input
                    type="text"
                    value={inputs[f.key] || ''}
                    onChange={(ev) => setField(f.key, ev.target.value)}
                    placeholder={f.placeholder}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                )}
                {f.hint && <p className="mt-0.5 text-[11px] text-slate-400">{f.hint}</p>}
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <p className="mt-3 text-xs text-rose-500">
              未入力の必須項目: {missingRequired.map((f) => f.label).join('、')}
              <span className="text-slate-400">（未入力でも生成できますが、該当欄は「要記入」と出力されます）</span>
            </p>
          )}
        </section>

        {/* モードボタン */}
        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              disabled={loading}
              onClick={() => run(m.mode)}
              title={m.desc}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition disabled:opacity-50 ${
                mode === m.mode
                  ? 'border-sky-600 bg-sky-100'
                  : 'border-slate-300 bg-white hover:border-sky-400 hover:bg-sky-50'
              }`}
            >
              <span className="text-xl">{m.icon}</span>
              <span className="text-xs font-bold text-slate-800">{m.label}</span>
              <span className="hidden text-[10px] leading-tight text-slate-500 sm:block">{m.desc}</span>
            </button>
          ))}
        </section>

        {/* 結果 */}
        {(loading || result || error) && (
          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                {MODES.find((m) => m.mode === mode)?.label || '結果'}
              </h2>
              <div className="flex items-center gap-2">
                {loading && (
                  <button type="button" onClick={stop} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">停止</button>
                )}
                {result && !loading && (
                  <button type="button" onClick={copy} className="rounded border border-sky-300 px-2 py-1 text-xs text-sky-700 hover:bg-sky-50">
                    {copied ? 'コピーしました' : 'コピー'}
                  </button>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {loading && !result && <p className="text-sm text-slate-400">生成中…</p>}
            {result && (
              <div className="chat-markdown text-sm text-slate-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
              </div>
            )}
          </section>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-400">
          出力は下書きです。必ずご自身の実体験・契約書類・最新の受験案内と照合してから清書してください。
        </p>
      </div>
    </main>
  );
}
