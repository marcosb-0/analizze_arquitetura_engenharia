import React from 'react';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: number;
}

export default function Spinner({ size = 14 }: SpinnerProps) {
  return (
    <Loader2 size={size} className="animate-spin text-current shrink-0" />
  );
}
