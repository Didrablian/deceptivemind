import { HiddenWordGameProvider } from '@/context/HiddenWordGameContext';

export default function HiddenWordGameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-accent/5 to-primary/5">
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  );
} 