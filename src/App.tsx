import { Button } from '@/components/ui/button';

export function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Transcripto</h1>
        <p className="text-muted-foreground">Welcome to your Electron app.</p>
        <Button>Get Started</Button>
      </div>
    </div>
  );
}
