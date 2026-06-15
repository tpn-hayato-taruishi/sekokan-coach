'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-teal-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="text-6xl mb-4">😵</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          エラーが発生しました
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {error.message || '予期しないエラーが発生しました。もう一度お試しください。'}
        </p>
        {error.digest && (
          <p className="text-xs text-slate-400 mb-4 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-semibold text-sm transition cursor-pointer"
          >
            もう一度試す
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition"
          >
            トップに戻る
          </a>
        </div>
      </div>
    </div>
  );
}
