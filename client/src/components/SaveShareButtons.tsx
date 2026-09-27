import { Download, Share2 } from "lucide-react";
import { downloadFile } from "@/lib/fileUtils";
import { canShareFiles, shareFile } from "@/lib/share";
import { useToast } from "@/hooks/use-toast";

/** "Save" plus, where the device supports it, "Share" through the system share sheet. */
const SaveShareButtons = ({ file, saveLabel = "Save PDF", className = "" }: { file: File; saveLabel?: string; className?: string }) => {
  const { toast } = useToast();
  const shareable = canShareFiles(file);

  const onShare = async () => {
    try {
      const r = await shareFile(file);
      if (r === "unsupported") downloadFile(file, file.name, file.type);
    } catch {
      toast({ variant: "destructive", title: "Couldn't open sharing", description: "Save the file instead, then share it from your files." });
    }
  };

  return (
    <div className={`flex flex-col gap-2 sm:flex-row ${className}`}>
      <button
        type="button"
        onClick={() => downloadFile(file, file.name, file.type)}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        <Download size={16} /> {saveLabel}
      </button>
      {shareable && (
        <button
          type="button"
          onClick={onShare}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-brand px-5 text-sm font-semibold text-brand hover:bg-brand-tint"
        >
          <Share2 size={16} /> Share
        </button>
      )}
    </div>
  );
};

export default SaveShareButtons;
