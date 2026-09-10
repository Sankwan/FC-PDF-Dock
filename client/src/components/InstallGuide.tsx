import { useState } from "react";
import { Share, Plus, MoreVertical, Monitor, Check, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { brand } from "@/brand";
import { useInstallPrompt, type Platform } from "@/hooks/useInstallPrompt";

const TABS: { id: Platform; label: string }[] = [
  { id: "ios", label: "iPhone / iPad" },
  { id: "android", label: "Android" },
  { id: "desktop", label: "Mac / Windows" },
];

interface InstallGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Dialog only — no built-in trigger, since the app wants different trigger
 *  buttons in different places (a compact header icon, a labeled mobile-menu
 *  row, a Hero CTA) all opening this same shared dialog. See useInstallPrompt
 *  (exported alongside) for whether the "Save App" trigger should render at
 *  all — hide it once `isStandalone` is true. */
const InstallGuide = ({ open, onOpenChange }: InstallGuideProps) => {
  const { platform, canPromptDirectly, promptInstall } = useInstallPrompt();
  const [activeTab, setActiveTab] = useState<Platform>(platform);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install {brand.name}</DialogTitle>
          <DialogDescription>
            Installs like a real app — its own icon, opens without browser chrome, works offline.
            Still 100% local: installing changes nothing about how your files are processed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2 py-2 text-xs font-semibold uppercase tracking-wide border transition-colors ${
                activeTab === tab.id
                  ? "border-brand bg-brand-tint text-brand"
                  : "border-border text-muted-foreground hover:border-brand"
              }`}
            >
              {tab.label}
              {platform === tab.id && <span className="block text-[9px] font-normal normal-case mt-0.5 opacity-70">(this device)</span>}
            </button>
          ))}
        </div>

        {activeTab === "ios" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              iOS only allows installing from <strong className="text-foreground">Safari</strong> — this
              won't work from Chrome, Firefox, or any other browser on iPhone/iPad, even though they
              can all open the site fine.
            </p>
            <ol className="space-y-2.5 text-sm text-foreground">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">1</span>
                <span className="flex items-center gap-1.5">Open this page in Safari, then tap the Share icon <Share size={14} className="inline text-brand" /> in the toolbar.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">2</span>
                <span className="flex items-center gap-1.5">Scroll down and tap <strong>"Add to Home Screen"</strong> <Plus size={14} className="inline text-brand" />.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">3</span>
                <span>Tap <strong>"Add"</strong> in the top corner. The icon now lives on your home screen.</span>
              </li>
            </ol>
          </div>
        )}

        {activeTab === "android" && (
          <div className="space-y-3">
            {canPromptDirectly ? (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your browser supports installing directly — no manual steps needed.
                </p>
                <Button onClick={() => promptInstall().then((ok) => ok && onOpenChange(false))} className="w-full bg-brand text-white hover:bg-brand-dark">
                  <Download size={15} className="mr-2" /> Install Now
                </Button>
              </>
            ) : (
              <ol className="space-y-2.5 text-sm text-foreground">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">1</span>
                  <span className="flex items-center gap-1.5">Tap the menu icon <MoreVertical size={14} className="inline text-brand" /> (top right of Chrome).</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">2</span>
                  <span>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">3</span>
                  <span>Confirm by tapping <strong>"Install"</strong>.</span>
                </li>
              </ol>
            )}
          </div>
        )}

        {activeTab === "desktop" && (
          <div className="space-y-3">
            {canPromptDirectly ? (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your browser supports installing directly — no manual steps needed.
                </p>
                <Button onClick={() => promptInstall().then((ok) => ok && onOpenChange(false))} className="w-full bg-brand text-white hover:bg-brand-dark">
                  <Download size={15} className="mr-2" /> Install Now
                </Button>
              </>
            ) : (
              <>
                <ol className="space-y-2.5 text-sm text-foreground">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">1</span>
                    <span className="flex items-center gap-1.5">In Chrome or Edge, look for the install icon <Monitor size={14} className="inline text-brand" /> at the right of the address bar.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">2</span>
                    <span>No icon there? Open the <strong>⋮ menu → "Install {brand.shortName}..."</strong>.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">3</span>
                    <span>Click <strong>"Install"</strong> in the dialog that appears.</span>
                  </li>
                </ol>
                <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border">
                  <strong className="text-foreground">Firefox on desktop doesn't support installing apps.</strong> Use
                  Chrome or Edge, or just keep the site bookmarked — every tool still works.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted p-3 rounded-lg">
          <Check size={14} className="text-brand flex-shrink-0 mt-0.5" />
          <span>
            After the first load, everything keeps working offline — turn on airplane mode and
            reload to confirm.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InstallGuide;
