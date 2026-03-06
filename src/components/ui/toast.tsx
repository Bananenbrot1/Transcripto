import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

interface ToastProps {
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, action, duration = 5000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 200); // wait for fade-out
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <span className="text-sm">{message}</span>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      <button onClick={() => { setVisible(false); setTimeout(onClose, 200); }} className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}
