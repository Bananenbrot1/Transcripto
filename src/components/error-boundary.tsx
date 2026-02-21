import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background text-foreground p-6">
          <div className="text-center space-y-4 max-w-md">
            <AlertCircle className="size-12 mx-auto text-destructive" />
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground font-mono break-all">
              {this.state.error.message}
            </p>
            <Button onClick={() => this.setState({ error: null })} variant="outline">
              <RefreshCw className="size-4" />
              Try to recover
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
