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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-blush px-4 py-3.5 text-sienna">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-sienna" />
        <div className="text-[13.5px] leading-snug">
          <span className="font-medium">{message}</span>
          {code && (
            <span className="ml-2 rounded-full bg-paper/70 px-2 py-0.5 font-mono text-[11px] text-sienna">
              {code}
            </span>
          )}
        </div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" shape="pill" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
