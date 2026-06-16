'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: number;
}

interface ThemeSampleProblem {
  level?: string;
  year?: string;
  no?: number;
  question?: string;
  choices?: string[];
  correctAnswer?: number;
}

interface QuizContext {
  level?: string;
  year?: string;
  no?: number;
  subject?: string;
  theme?: string;
  question?: string;
  choices?: string[];
  correctAnswer?: number;
  userSelection?: number;
  explanation?: string;
  themeSamples?: ThemeSampleProblem[];
}

interface ChatUIProps {
  context?: QuizContext;
  storageKey?: string;
}

export interface ChatUIHandle {
  /** プログラムから 1ターン分のメッセージを送る (UI から「AI解説」ボタンで呼ぶ用) */
  sendMessage: (text: string) => Promise<void>;
  /** 履歴クリア (新しい問題に切り替わったら呼ぶ想定) */
  clear: () => void;
}

const ChatUI = forwardRef<ChatUIHandle, ChatUIProps>(function ChatUIInner(
  { context, storageKey = 'sekokan-chat-history' }: ChatUIProps,
  ref,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-20)));
    } catch {}
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, storageKey]);

  const sendText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || busy) return;
    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          quizContext: context,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '通信エラー' }));
        setError(errData.error || `APIエラー (${res.status})`);
        setBusy(false);
        return;
      }

      if (!res.body) {
        setError('レスポンスが空です');
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() };
      setMessages([...next, assistantMsg]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        setMessages((curr) => {
          const updated = [...curr];
          updated[updated.length - 1] = { ...assistantMsg, content: assistantContent };
          return updated;
        });
      }
    } catch (e) {
      setError((e as Error).message || '通信エラー');
    } finally {
      setBusy(false);
    }
  }, [busy, messages, context]);

  const send = useCallback(() => sendText(input), [sendText, input]);

  const clearInternal = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);

  const clear = useCallback(() => {
    if (!confirm('チャット履歴をクリアしますか？')) return;
    clearInternal();
  }, [clearInternal]);

  useImperativeHandle(ref, () => ({
    sendMessage: sendText,
    clear: clearInternal,
  }), [sendText, clearInternal]);

  const quickActions: { label: string; prompt: string }[] = [
    {
      label: '正答の根拠',
      prompt: 'この問題の設問極性 (適当を選ぶ問題か、不適当を選ぶ問題か) を確認した上で、正答の根拠を法令条文や公式で具体的に説明してください。',
    },
    {
      label: '誤答3つの理由',
      prompt: '誤答3つそれぞれについて、なぜ誤りか (または不適当系問題なら、なぜ正しい文か) を具体的な根拠とともに教えてください。1つも省略しないでください。',
    },
    {
      label: '覚えるコツ',
      prompt: 'このテーマで覚えるべき不変ポイント (法令/物理/規格の絶対基準) を、語呂合わせや具体的なキーワード→正答対応の形で5個以内に絞って教えてください。',
    },
    {
      label: '類題の絞り込み法',
      prompt: 'このテーマで類似問題が出たとき、選択肢を見た瞬間に怪しい/正解候補を絞り込むためのキーワードパターンを教えてください。実際の過去問例も併記してください。',
    },
  ];

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="font-bold text-slate-800">🤖 AI 解説チャット (Bedrock Claude)</div>
        <button
          onClick={clear}
          className="text-xs px-3 py-1 text-slate-600 hover:bg-slate-200 rounded"
        >
          履歴クリア
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-slate-400 text-sm text-center py-8">
            問題について自由に質問してください。
            <br />
            (例: 正解の理由、他の選択肢の誤り、覚え方など)
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`${m.role === 'user' ? 'max-w-[85%]' : 'max-w-[95%]'} px-4 py-3 rounded-lg ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="prose prose-base max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || '...'}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm">{m.content}</div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="text-slate-400 text-xs">生成中...</div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-700 text-sm">
          ⚠ {error}
        </div>
      )}

      <div className="border-t border-slate-200 p-3 space-y-2">
        <div className="flex flex-wrap gap-1">
          {quickActions.map((q) => (
            <button
              key={q.label}
              onClick={() => { setInput(q.prompt); }}
              disabled={busy}
              title={q.prompt}
              className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="質問を入力 (Enterで送信、Shift+Enterで改行)"
            disabled={busy}
            rows={2}
            className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
});

export default ChatUI;
