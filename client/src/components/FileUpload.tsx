import React, { useEffect } from "react";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Upload, FileText, ImageIcon, ArrowRight, RefreshCw, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFileVault, fileMatchesAccept } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { ensureUnlocked } from "@/components/UnlockPdfDialog";

interface FileUploadProps {
  accept?: string;
  maxSizeInMB?: number;
  multiple?: boolean;
  onFilesSelected?: (files: File[]) => void;
  className?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  buttonText?: string;
  colorScheme?: "primary" | "secondary" | "accent" | "red" | "yellow" | "indigo";
}

const FileUpload: React.FC<FileUploadProps> = ({
  accept = "*",
  maxSizeInMB = 50,
  multiple = false,
  onFilesSelected,
  className = "",
  icon = <Upload size={30} />,
  title,
  description = "Drag & drop your files here or click to browse",
  buttonText = "Select Files",
}) => {
  const {
    files,
    fileInputRef,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileSelect,
    triggerFileInput,
    error,
  } = useFileUpload({ accept, maxSizeInMB, multiple });

  const { files: vaultFiles, addFiles, removeFile } = useFileVault();

  // Files carried in from the drop hero (or another tool) are offered as a
  // chip below, never auto-adopted — auto-adopting on mount used to
  // resurrect files a page had just removed (remounting FileUpload at 0
  // files re-imported the same vault entries) and silently pre-fill a
  // fresh tool page with a document from a different tool.
  const carried = vaultFiles.filter((f) => fileMatchesAccept(f.file, accept));

  useEffect(() => {
    if (files.length === 0) return;
    let cancelled = false;
    // Encrypted PDFs are unlocked (or dropped) before any tool sees them.
    ensureUnlocked(files).then((ready) => {
      if (cancelled || ready.length === 0) return;
      addFiles(ready);
      onFilesSelected?.(ready);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  return (
    <div className={className}>
      {carried.length > 0 && (
        <div className="mb-4 rounded-2xl border border-black/[0.07] bg-card/70 p-3 backdrop-blur-xl">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Carried over from your workspace
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {carried.map((item) => (
              <div key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() =>
                    onFilesSelected?.(multiple ? carried.map((f) => f.file) : [item.file])
                  }
                  className="flex w-full items-center gap-3 rounded-xl border border-black/[0.06] bg-card px-3 py-2.5 pr-8 text-left transition-all hover:-translate-y-0.5 hover:border-brand"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-tint">
                    {item.kind === "image" ? (
                      <img src={item.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <FileText size={16} className="text-brand" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {item.file.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatFileSize(item.file.size)}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => removeFile(item.id)}
                  aria-label={`Remove ${item.file.name} from workspace`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-black/[0.06] hover:text-foreground"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className={`cursor-pointer rounded-[24px] border border-dashed p-8 text-center backdrop-blur-xl transition-all duration-300 sm:p-12 ${
          isDragging
            ? "border-brand bg-brand-tint/90 shadow-[0_26px_70px_-42px_rgba(43,125,53,0.45)]"
            : "border-black/[0.12] bg-card/60 hover:border-brand/60 hover:bg-card/85"
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={handleFileSelect}
        />
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[18px] border border-black/[0.06] bg-card text-brand shadow-[0_14px_36px_-22px_rgba(43,125,53,0.55)]">
          {icon}
        </div>
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerFileInput();
          }}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-brand-dark hover:shadow-[0_14px_30px_-14px_rgba(43,125,53,0.7)]"
        >
          {carried.length > 0 ? <RefreshCw size={14} /> : <ImageIcon size={14} className="hidden" />}
          {carried.length > 0 ? "Use a different file" : buttonText}
        </button>
        <p className="mt-3 text-xs text-muted-foreground">Max file size: {maxSizeInMB}MB</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default FileUpload;
