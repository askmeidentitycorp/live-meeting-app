"use client";

export function ErrorDisplay({ connectionError, onDismiss }) {
  if (!connectionError) return null;

  return (
    <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg">
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-2">
          <div className="w-4 h-4 bg-red-500 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <span className="text-sm">{connectionError}</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-red-600 hover:text-red-800 font-bold"
        >
          ×
        </button>
      </div>
    </div>
  );
}