import React from "react";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[24px] border border-hairline bg-fog px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-mist text-ink">
        {icon}
      </div>
      <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-[13.5px] text-slate-muted leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
