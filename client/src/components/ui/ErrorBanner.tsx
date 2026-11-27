"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

interface ErrorBannerProps {
  message: string;
  code?: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, code, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-rose-900">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <div className="text-sm">
          <span className="font-medium">{message}</span>
          {code && (
            <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] text-rose-700">
              {code}
            </span>
          )}
        </div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
