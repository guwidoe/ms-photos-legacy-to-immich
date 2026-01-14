import { Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';

export interface ProgressItem {
  id: string | number;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

interface ProgressModalProps {
  isOpen: boolean;
  title: string;
  items: ProgressItem[];
  currentIndex: number;
  onCancel: () => void;
  canCancel: boolean;
  // Sub-progress for per-face tracking within a person
  subProgress?: {
    current: number;
    total: number;
    label?: string;
  };
}

export default function ProgressModal({
  isOpen,
  title,
  items,
  currentIndex,
  onCancel,
  canCancel,
  subProgress,
}: ProgressModalProps) {
  if (!isOpen) return null;

  const completed = items.filter(i => i.status === 'success').length;
  const failed = items.filter(i => i.status === 'error').length;
  const total = items.length;
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;
  const isComplete = completed + failed === total;
  const currentItem = items[currentIndex];
  
  // Calculate sub-progress percentage
  const subProgressPercent = subProgress && subProgress.total > 0 
    ? (subProgress.current / subProgress.total) * 100 
    : 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="glass rounded-xl border border-white/10 w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">{title}</h3>
          {isComplete && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/70">
              {isComplete ? 'Complete' : 'Processing...'}
            </span>
            <span className="text-white/50">
              {completed + failed} / {total}
            </span>
          </div>
          <div className="h-2 bg-void-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-neon-purple to-neon-cyan transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Current item */}
        {!isComplete && currentItem && (
          <div className="px-4 py-3 border-t border-white/5">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-neon-purple flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{currentItem.name}</p>
                {subProgress ? (
                  <div className="mt-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-white/40">
                        {subProgress.label || 'Processing'} {subProgress.current}/{subProgress.total}
                      </span>
                      <span className="text-white/30">{Math.round(subProgressPercent)}%</span>
                    </div>
                    <div className="h-1 bg-void-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neon-cyan/70 transition-all duration-150"
                        style={{ width: `${subProgressPercent}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-white/40 text-sm">Applying to Immich...</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results summary when complete */}
        {isComplete && (
          <div className="px-4 py-3 border-t border-white/5 space-y-2">
            {completed > 0 && (
              <div className="flex items-center gap-2 text-neon-green">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">{completed} applied successfully</span>
              </div>
            )}
            {failed > 0 && (
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{failed} failed</span>
              </div>
            )}
          </div>
        )}

        {/* Recent items list */}
        <div className="px-4 py-3 border-t border-white/5 max-h-48 overflow-y-auto">
          <div className="space-y-1">
            {items.slice(0, currentIndex + 5).map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 py-1 text-sm ${
                  idx === currentIndex ? 'text-white' : 'text-white/50'
                }`}
              >
                {item.status === 'pending' && (
                  <div className="w-4 h-4 rounded-full border border-white/20" />
                )}
                {item.status === 'processing' && (
                  <Loader2 className="w-4 h-4 animate-spin text-neon-purple" />
                )}
                {item.status === 'success' && (
                  <CheckCircle2 className="w-4 h-4 text-neon-green" />
                )}
                {item.status === 'error' && (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
                <span className="truncate flex-1">{item.name}</span>
                {item.status === 'error' && item.error && (
                  <span className="text-red-400/70 text-xs truncate max-w-32" title={item.error}>
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end gap-3">
          {!isComplete && canCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-void-700 text-white hover:bg-void-600 text-sm"
            >
              Cancel
            </button>
          )}
          {isComplete && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-neon-purple to-neon-cyan text-white text-sm font-medium"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
