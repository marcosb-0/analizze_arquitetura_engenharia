import React from 'react';
import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center space-y-4 w-full bg-white border border-slate-200 rounded-lg shadow-sm">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-full text-slate-400 inline-block">
          <Icon size={40} className="stroke-1" />
        </div>
      </motion.div>
      
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">
          {title}
        </h3>
        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded transition shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
