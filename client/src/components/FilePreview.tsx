import React from "react";
import { X, RotateCw, Trash, Loader2 } from "lucide-react";

interface FilePreviewProps {
  files: File[];
  onRemove?: (index: number) => void;
  onRemoveAll?: () => void;
  onRotate?: (index: number) => void;
  showControls?: boolean;
  fileType: "pdf" | "image";
  previewUrls?: string[];
  onAddMore?: () => void;
  className?: string;
  /** Shows a spinner in place of the preview thumbnail(s) while true —
   *  e.g. while a large file's first-page preview is still rendering. */
  isLoadingPreview?: boolean;
}

const PdfIcon = ({ className = "h-8 w-8" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`${className} text-brand`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const ImageIcon = ({ className = "h-8 w-8" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`${className} text-foreground`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const FilePreview: React.FC<FilePreviewProps> = ({
  files,
  onRemove,
  onRemoveAll,
  onRotate,
  showControls = true,
  fileType,
  previewUrls = [],
  onAddMore,
  className = "",
  isLoadingPreview = false,
}) => {
  if (files.length === 0) return null;

  if (fileType === "pdf" && files.length === 1) {
    return (
      <div className={`mb-6 overflow-hidden rounded-2xl border border-black/[0.08] bg-card/65 shadow-[0_24px_70px_-48px_rgba(0,0,0,0.5)]  ${className}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-black/[0.06] bg-card/55 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <PdfIcon className="h-5 w-5" />
            <span className="text-sm font-medium text-foreground min-w-0 truncate">{files[0].name}</span>
          </div>
          {showControls && (
            <button
              className="text-muted-foreground hover:text-brand transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => onRemoveAll?.()}
              aria-label="Remove file"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="p-5 flex flex-col items-center justify-center bg-card">
          {isLoadingPreview ? (
            <div className="w-full max-w-xs flex items-center justify-center p-8 bg-muted border border-border mb-3">
              <div className="text-center">
                <Loader2 className="h-10 w-10 mx-auto animate-spin text-brand" />
                <p className="mt-2 text-xs text-muted-foreground">Preparing preview…</p>
              </div>
            </div>
          ) : previewUrls.length > 0 ? (
            <div className="mb-3 aspect-[1/1.35] w-full max-w-xs overflow-hidden rounded-xl border border-black/[0.08] bg-muted shadow-sm">
              <img src={previewUrls[0]} alt={`First page preview of ${files[0].name}`} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="w-full max-w-xs flex items-center justify-center p-8 bg-muted border border-border mb-3">
              <div className="text-center">
                <PdfIcon className="h-14 w-14 mx-auto" />
                <p className="mt-2 text-xs text-muted-foreground truncate max-w-[200px]">{files[0].name}</p>
              </div>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {(files[0].size / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`border border-border mb-6 ${className}`}>
      <div className="bg-background border-b border-border px-4 py-2.5 flex justify-between items-center">
        <h2 className="text-sm font-medium text-foreground">Selected Files ({files.length})</h2>
        {showControls && (
          <div className="flex items-center gap-3">
            {onAddMore && (
              <button className="text-xs text-brand hover:text-brand-dark font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring transition-colors" onClick={onAddMore}>
                + Add More
              </button>
            )}
            <button className="text-muted-foreground hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring transition-colors" onClick={() => onRemoveAll?.()} aria-label="Clear all files">
              <Trash size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-card">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="border border-border overflow-hidden group relative">
              {showControls && (
                <div className="absolute bottom-2 right-2 z-10 flex items-center justify-center gap-2 rounded-md bg-card/95 p-1">
                  {onRemove && (
                    <button
                      className="w-11 h-11 bg-card text-brand hover:bg-brand hover:text-white transition-colors flex items-center justify-center"
                      onClick={() => onRemove(index)}
                      aria-label={`Remove image ${index + 1}`}
                      title="Remove"
                    >
                      <Trash size={12} />
                    </button>
                  )}
                  {onRotate && (
                    <button
                      className="w-11 h-11 bg-card text-foreground hover:bg-foreground hover:text-background transition-colors flex items-center justify-center"
                      onClick={() => onRotate(index)}
                      aria-label={`Rotate image ${index + 1}`}
                      title="Rotate"
                    >
                      <RotateCw size={12} />
                    </button>
                  )}
                </div>
              )}

              {isLoadingPreview && !previewUrls[index] ? (
                <div className="w-full h-36 flex items-center justify-center bg-muted">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              ) : previewUrls[index] ? (
                <img
                  src={previewUrls[index]}
                  alt={`File ${index + 1}`}
                  className="w-full h-36 object-cover"
                />
              ) : (
                <div className="w-full h-36 flex items-center justify-center bg-muted">
                  {fileType === "image" ? <ImageIcon /> : <PdfIcon />}
                </div>
              )}

              <div className="p-2 bg-card border-t border-border">
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span className="truncate max-w-[80%]" title={file.name}>{file.name}</span>
                  <span className="bg-muted px-1.5 py-0.5 text-muted-foreground font-medium">{index + 1}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FilePreview;
