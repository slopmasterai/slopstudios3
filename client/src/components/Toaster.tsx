import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast, dismissToast, type Toast } from '@/hooks/useToast';

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 200); // Wait for animation
  };

  const Icon = {
    default: Info,
    success: CheckCircle,
    destructive: AlertCircle,
  }[toast.variant || 'default'];

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-background p-4 shadow-lg transition-all duration-200',
        isVisible
          ? 'translate-x-0 opacity-100'
          : 'translate-x-full opacity-0',
        toast.variant === 'destructive' && 'border-destructive/50 bg-destructive/10',
        toast.variant === 'success' && 'border-green-500/50 bg-green-500/10'
      )}
    >
      <Icon
        className={cn(
          'h-5 w-5 flex-shrink-0',
          toast.variant === 'destructive' && 'text-destructive',
          toast.variant === 'success' && 'text-green-500',
          !toast.variant || toast.variant === 'default' && 'text-primary'
        )}
      />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && (
          <p className="text-sm text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 rounded-md p-1 hover:bg-accent transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 flex flex-col gap-2 p-4 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}

export default Toaster;
