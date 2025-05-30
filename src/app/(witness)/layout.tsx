import { WitnessGameProvider } from '@/context/WitnessGameContext';

export default function WitnessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WitnessGameProvider>
      {children}
    </WitnessGameProvider>
  );
} 