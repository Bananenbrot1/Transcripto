import { useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SummaryResult } from '../../shared/types';

interface SummaryPanelProps {
  summary: SummaryResult;
}

export function SummaryPanel({ summary }: SummaryPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(summary.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const tokenInfo = summary.usage.totalTokens > 0
    ? `${summary.usage.totalTokens.toLocaleString()} tokens`
    : null;

  return (
    <div className="flex-1 overflow-y-auto pr-1">
      <div className="flex items-center justify-end mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          title="Copy summary to clipboard"
        >
          <ClipboardCopy className="size-3.5" />
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
        {summary.text}
      </div>
      {tokenInfo && (
        <p className="text-xs text-muted-foreground mt-4">
          {tokenInfo}
        </p>
      )}
    </div>
  );
}
