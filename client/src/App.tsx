import { lazy, Suspense, useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import { FileVaultProvider } from "@/context/FileVault";
import { AuthProvider, useAuth } from "@/context/Auth";
import { features } from "@/brand";
import UnlockPdfDialog from "@/components/UnlockPdfDialog";
import Home from "@/pages/Home";
import AuthPage from "@/pages/Auth";
import MergePdf from "@/pages/MergePdf";
import SplitPdf from "@/pages/SplitPdf";
import CompressPdf from "@/pages/CompressPdf";
import PdfToImage from "@/pages/PdfToImage";
import ImageToPdf from "@/pages/ImageToPdf";
import WatermarkPdf from "@/pages/WatermarkPdf";
import ProtectPdf from "@/pages/ProtectPdf";
import SignPdf from "@/pages/SignPdf";
import OcrPdf from "@/pages/OcrPdf";
import WordToPdf from "@/pages/WordToPdf";
import PdfToWord from "@/pages/PdfToWord";
import OrganizePdf from "@/pages/OrganizePdf";

// Heavier tools load on demand so the first install stays small.
const RedactPdf = lazy(() => import("@/pages/RedactPdf"));
const ScanDocument = lazy(() => import("@/pages/ScanDocument"));
const Letterhead = lazy(() => import("@/pages/Letterhead"));
const PdfMetadata = lazy(() => import("@/pages/PdfMetadata"));
const PdfForms = lazy(() => import("@/pages/PdfForms"));
const QrTools = lazy(() => import("@/pages/QrTools"));
const ImageConvert = lazy(() => import("@/pages/ImageConvert"));

const AUTH_PATHS = ["/sign-in", "/create-account", "/verify"];

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    // Links like "/#tools" should land on that section, not the page top.
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [location]);
  return null;
}

const PageLoading = () => (
  <div className="grid min-h-[50vh] place-items-center text-muted-foreground">
    <Loader2 className="animate-spin" size={22} aria-label="Loading" />
  </div>
);

function Tools() {
  return (
    <Layout>
      <Suspense fallback={<PageLoading />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/merge-pdfs" component={MergePdf} />
          <Route path="/split-pdf" component={SplitPdf} />
          <Route path="/organize-pdf" component={OrganizePdf} />
          <Route path="/compress-pdf" component={CompressPdf} />
          <Route path="/pdf-to-image" component={PdfToImage} />
          <Route path="/image-to-pdf" component={ImageToPdf} />
          <Route path="/scan" component={ScanDocument} />
          <Route path="/watermark-pdf" component={WatermarkPdf} />
          <Route path="/letterhead" component={Letterhead} />
          <Route path="/pdf-properties" component={PdfMetadata} />
          <Route path="/pdf-forms" component={PdfForms} />
          <Route path="/qr-codes" component={QrTools} />
          <Route path="/convert-images" component={ImageConvert} />
          <Route path="/protect-pdf" component={ProtectPdf} />
          <Route path="/redact-pdf" component={RedactPdf} />
          <Route path="/sign-pdf" component={SignPdf} />
          <Route path="/ocr-pdf" component={OcrPdf} />
          <Route path="/word-to-pdf" component={WordToPdf} />
          <Route path="/pdf-to-word" component={PdfToWord} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      <UnlockPdfDialog />
    </Layout>
  );
}

function Gate() {
  const { status } = useAuth();
  const [location] = useLocation();
  const onAuthPage = AUTH_PATHS.includes(location);

  if (!features.authRequired) {
    return onAuthPage ? <Redirect to="/" /> : <Tools />;
  }
  if (status === "loading") return <PageLoading />;
  if (status === "signed-out") {
    if (!onAuthPage) return <Redirect to="/sign-in" />;
    return (
      <Switch>
        <Route path="/verify">{() => <AuthPage fromLink />}</Route>
        <Route>{() => <AuthPage />}</Route>
      </Switch>
    );
  }
  // Signed in: an old email link or bookmark to an auth page goes home.
  if (onAuthPage) return <Redirect to="/" />;
  return <Tools />;
}

function App() {
  return (
    <AuthProvider>
      <FileVaultProvider>
        <ScrollToTop />
        <Gate />
        <Toaster />
      </FileVaultProvider>
    </AuthProvider>
  );
}

export default App;
