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
      <div className="flex flex-col items-center justify-center rounded-[24px] bg-mist px-6 py-14 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-paper text-slate-muted">
          <ImageOff className="h-5 w-5" />
        </div>
        <h3 className="mt-3.5 text-[14.5px] font-semibold text-ink">
          {failed ? "Room Photo Unavailable" : "No 360° / Room Photo Archived"}
        </h3>
        <p className="mt-1 max-w-sm text-[13px] text-slate-muted">
          {failed
            ? "The external Warwick AV room photograph could not be loaded in this browser session."
            : `Visual panorama imagery is not yet attached for ${resourceName}.`}
        </p>
        {imageUrl && (
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline underline-offset-4"
          >
            Open original Warwick image URL
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-hairline bg-paper overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-ink" />
          <span className="text-[13px] font-medium text-ink">
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-muted hover:bg-mist hover:text-ink"
            title="Open source photo"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="relative h-72 sm:h-80 w-full overflow-hidden bg-ink">
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent px-5 py-3.5 text-paper">
          <p className="text-[13.5px] font-medium">{resourceName}</p>
          <p className="text-[12px] text-paper/80">{location}</p>
        </div>
      </div>

      {/* Interactive Pan Slider */}
      <div className="flex items-center gap-3 bg-fog px-5 py-3 border-t border-hairline">
        <MoveHorizontal className="h-4 w-4 text-ash shrink-0" />
        <span className="text-[12px] font-medium text-slate-muted whitespace-nowrap">
          Pan view
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={panX}
          onChange={(e) => setPanX(Number(e.target.value))}
          aria-label="Pan room photograph horizontally"
          className="w-full accent-ink cursor-pointer"
        />
        <span className="font-mono text-[11.5px] text-slate-muted tabular-nums w-10 text-right">
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
        <div className="overflow-hidden rounded-[12px] bg-ink">
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
