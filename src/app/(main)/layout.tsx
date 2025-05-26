import type { ReactNode } from 'react';
import { GameTitle } from '@/components/GameTitle';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <GameTitle />
      <main className="w-full max-w-md bg-card p-6 sm:p-8 rounded-xl shadow-2xl">
        {children}
      </main>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Deceptive Minds. Uncover the truth.</p>
      </footer>
    </div>
  );
}
