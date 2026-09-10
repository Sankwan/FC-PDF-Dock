import { useState, useCallback, useMemo } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { ShieldCheck, Download, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, downloadFile } from "@/lib/fileUtils";
import { protectPdf } from "@/lib/pdfUtils";
import { lockPdfWithPassword } from "@/lib/pdfEncryption";

const ProtectPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [clearMetadata, setClearMetadata] = useState(true);
  const [addPassword, setAddPassword] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keyLength, setKeyLength] = useState<"128" | "256">("256");

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [progress, setProgress] = useState(0);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [resultSummary, setResultSummary] = useState("");

  const passwordError =
    addPassword && password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword
      ? "Passwords don't match."
      : null;

  const canSubmit = useMemo(() => {
    if (!clearMetadata && !addPassword) return false;
    if (addPassword && (!password.trim() || password !== confirmPassword)) return false;
    return true;
  }, [clearMetadata, addPassword, password, confirmPassword]);

  const handlePdfSelected = useCallback(async (files: File[]) => {
    if (files.length > 0 && files[0].type === "application/pdf") {
      setPdfFile(files[0]);
      setPdfPreviewUrl("");
      setResultFile(null);
      setIsLoadingPreview(true);
      try {
        const url = await generateFilePreview(files[0]);
        setPdfPreviewUrl(url);
      } catch {
        // preview optional
      } finally {
        setIsLoadingPreview(false);
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    // Also drop this file from the shared workspace vault — otherwise a
    // fresh FileUpload silently re-adopts the file we just finished with.
    vaultFiles.filter(vf => vf.file === pdfFile).forEach(vf => removeVaultFile(vf.id));
    setPdfFile(null);
    setIsLoadingPreview(false);
    setPdfPreviewUrl("");
    setResultFile(null);
    setResultSummary("");
    setProgress(0);
    setPassword("");
    setConfirmPassword("");
  }, [pdfFile, vaultFiles, removeVaultFile]);

  const handleProcess = useCallback(async () => {
    if (!pdfFile || !canSubmit) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      let working = pdfFile;
      const didParts: string[] = [];

      if (clearMetadata) {
        setStatusText("Removing metadata...");
        setProgress(20);
        working = await protectPdf(working, { removeMetadata: true });
        didParts.push("metadata removed");
      }

      if (addPassword) {
        setStatusText("Encrypting (first run loads the local encryption engine)...");
        setProgress(50);
        working = await lockPdfWithPassword(working, { password, keyLength });
        didParts.push(`password-locked (AES-${keyLength})`);
      }

      setProgress(100);
      setResultFile(working);
      setResultSummary(didParts.join(", "));
      toast({ title: "PDF protected", description: didParts.join(", ") });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Failed", description: err instanceof Error ? err.message : "Could not protect this PDF." });
    } finally {
      setIsProcessing(false);
      setStatusText("");
    }
  }, [pdfFile, canSubmit, clearMetadata, addPassword, password, keyLength, toast]);

  const handleDownload = useCallback(() => {
    if (resultFile) downloadFile(resultFile, resultFile.name, "application/pdf");
  }, [resultFile]);

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Security</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Protect PDF</h1>
          <p className="text-muted-foreground text-sm mt-1">Lock a PDF with a real password and strip identifying metadata</p>
        </div>

        <div className="max-w-2xl space-y-3">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl shadow-sm">
            <div className="p-6">
              {!pdfFile ? (
                <FileUpload
                  accept=".pdf,application/pdf"
                  maxSizeInMB={100}
                  multiple={false}
                  onFilesSelected={handlePdfSelected}
                  title="Upload PDF to Protect"
                  description="Drag & drop or click to browse"
                  buttonText="Select PDF"
                  icon={<ShieldCheck size={36} />}
                />
              ) : (
                <>
                  <FilePreview
                    files={[pdfFile]}
                    fileType="pdf"
                    previewUrls={pdfPreviewUrl ? [pdfPreviewUrl] : []}
                    isLoadingPreview={isLoadingPreview}
                    onRemoveAll={handleReset}
                  />

                  {!resultFile && !isProcessing && (
                    <div className="border border-border p-5 mb-5 bg-muted space-y-5">
                      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">Protection Options</h4>

                      <div>
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id="add-password"
                            checked={addPassword}
                            onCheckedChange={(c) => setAddPassword(c as boolean)}
                            className="mt-0.5 border-border data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                          />
                          <div className="flex-1">
                            <Label htmlFor="add-password" className="text-sm font-medium text-foreground cursor-pointer flex items-center gap-1.5">
                              <Lock size={13} /> Require a password to open
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Real PDF encryption (AES) — the file cannot be opened in any reader without this password.
                            </p>
                          </div>
                        </div>

                        {addPassword && (
                          <div className="ml-7 mt-3 space-y-3">
                            <div>
                              <Label htmlFor="pwd" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</Label>
                              <div className="relative mt-1">
                                <Input
                                  id="pwd"
                                  type={showPassword ? "text" : "password"}
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  placeholder="Choose a password"
                                  className="border-border focus:border-brand focus:ring-0 pr-9"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword((v) => !v)}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="pwd-confirm" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Confirm password</Label>
                              <Input
                                id="pwd-confirm"
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Type it again"
                                className="mt-1 border-border focus:border-brand focus:ring-0"
                              />
                              {passwordError && <p className="text-xs text-destructive mt-1">{passwordError}</p>}
                            </div>
                            <div>
                              <Label htmlFor="key-length" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Encryption strength</Label>
                              <Select value={keyLength} onValueChange={(v: "128" | "256") => setKeyLength(v)}>
                                <SelectTrigger id="key-length" className="mt-1 border-border"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="256">256-bit AES (strongest, any reader from the last decade)</SelectItem>
                                  <SelectItem value="128">128-bit (best compatibility with older PDF readers)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              There's no password recovery — if it's lost, the file is permanently unreadable. Keep it somewhere safe.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-start gap-3 pt-1 border-t border-border/60">
                        <Checkbox
                          id="clear-meta"
                          checked={clearMetadata}
                          onCheckedChange={(c) => setClearMetadata(c as boolean)}
                          className="mt-0.5 border-border data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                        />
                        <div>
                          <Label htmlFor="clear-meta" className="text-sm font-medium text-foreground cursor-pointer">
                            Strip document metadata
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Removes author, title, creation date, and producer info</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isProcessing && (
                    <div className="mb-5">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{statusText || "Applying protection..."}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  )}

                  {resultFile && (
                    <Alert className="bg-background border border-foreground mb-5">
                      <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span><strong>Protected.</strong> {resultSummary || "Done."}</span>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    {!resultFile && !isProcessing && (
                      <Button
                        onClick={handleProcess}
                        disabled={!canSubmit}
                        className="bg-brand text-white hover:bg-brand-dark rounded-none font-semibold"
                      >
                        <ShieldCheck size={15} className="mr-2" /> Protect PDF
                      </Button>
                    )}
                    {resultFile && (
                      <Button
                        onClick={handleDownload}
                        className="bg-brand text-white hover:bg-brand-dark rounded-none font-semibold"
                      >
                        <Download size={15} className="mr-2" /> Download Protected PDF
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      className="border-border text-foreground hover:bg-background rounded-none"
                    >
                      {resultFile ? "Protect Another" : "Reset"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProtectPdf;
