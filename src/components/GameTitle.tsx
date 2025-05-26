
import { Zap } from 'lucide-react'; // Using Zap as a placeholder for "Minds" or "Deception"

export function GameTitle() {
  return (
    <header className="mb-8 text-center">
      <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-primary">
        <span className="inline-block">Deceptive</span>
        <span className="inline-block ml-2 text-accent">Minds <Zap className="inline-block w-10 h-10 sm:w-12 sm:h-12 -mt-1" /></span>
      </h1>
    </header>
  );
}
