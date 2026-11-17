import { Spinner as HeroSpinner } from '@heroui/react';

interface SpinnerProps {
  size?: number;
}

/** Spinner do HeroUI na cor do texto ao redor. `size` em px vira o degrau mais próximo. */
export default function Spinner({ size = 14 }: SpinnerProps) {
  return <HeroSpinner color="current" size={size <= 16 ? 'sm' : size <= 24 ? 'md' : 'lg'} className="shrink-0" />;
}
