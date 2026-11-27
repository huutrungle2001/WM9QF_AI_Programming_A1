"use client";

import React, { useState } from "react";
import {
  Camera,
  Expand,
  ExternalLink,
  ImageOff,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface PanoramaViewerProps {
  imageUrl?: string | null;
  resourceName: string;
  location: string;
}

export function PanoramaViewer({
  imageUrl,
  resourceName,
  location,
}: PanoramaViewerProps) {
  const [failed, setFailed] = useState(false);
  const [panX, setPanX] = useState(50);
  const [zoomed, setZoomed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  if (!imageUrl || failed) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-warwick-50/40 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
          <ImageOff className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-slate-800">
          {failed ? "Room Photo Unavailable" : "No 360° / Room Photo Archived"}
        </h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          {failed
            ? "The external Warwick AV room photograph could not be loaded in this browser session."
            : `Visual panorama imagery is not yet attached for ${resourceName}.`}
        </p>
        {imageUrl && (
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-warwick-700 hover:underline"
          >
            Open original Warwick image URL
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-warwick-700" />
          <span className="text-xs font-semibold text-slate-800">
            360° / Room Photo Viewer
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoomed((z) => !z)}
            title="Toggle zoom"
          >
            {zoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
            {zoomed ? "1x" : "1.5x"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFullscreen(true)}
            title="Expand preview"
          >
            <Expand className="h-3.5 w-3.5" />
          </Button>
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="Open source photo"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="relative h-64 sm:h-72 w-full overflow-hidden bg-slate-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`Room view of ${resourceName}`}
          onError={() => setFailed(true)}
          style={{
            objectPosition: `${panX}% 50%`,
            transform: zoomed ? "scale(1.45)" : "scale(1)",
          }}
          className="h-full w-full object-cover transition-transform duration-300"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent px-4 py-3 text-white">
          <p className="text-xs font-semibold">{resourceName}</p>
          <p className="text-[11px] text-slate-200">{location}</p>
        </div>
      </div>

      {/* Interactive Pan Slider */}
      <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 border-t border-slate-200">
        <MoveHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
          Pan View
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={panX}
          onChange={(e) => setPanX(Number(e.target.value))}
          aria-label="Pan room photograph horizontally"
          className="w-full accent-warwick-700 cursor-pointer"
        />
        <span className="font-mono text-[11px] text-slate-500 tabular-nums w-9 text-right">
          {panX}%
        </span>
      </div>

      <Modal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={resourceName}
        subtitle={location}
        maxWidthClass="max-w-4xl"
      >
        <div className="overflow-hidden rounded-xl bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`Full view of ${resourceName}`}
            className="w-full max-h-[65vh] object-contain"
          />
        </div>
      </Modal>
    </div>
  );
}
