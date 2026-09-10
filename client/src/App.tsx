import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import { FileVaultProvider } from "@/context/FileVault";
import Home from "@/pages/Home";
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

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/merge-pdfs" component={MergePdf} />
      <Route path="/split-pdf" component={SplitPdf} />
      <Route path="/compress-pdf" component={CompressPdf} />
      <Route path="/pdf-to-image" component={PdfToImage} />
      <Route path="/image-to-pdf" component={ImageToPdf} />
      <Route path="/watermark-pdf" component={WatermarkPdf} />
      <Route path="/protect-pdf" component={ProtectPdf} />
      <Route path="/sign-pdf" component={SignPdf} />
      <Route path="/ocr-pdf" component={OcrPdf} />
      <Route path="/word-to-pdf" component={WordToPdf} />
      <Route path="/pdf-to-word" component={PdfToWord} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <FileVaultProvider>
      <ScrollToTop />
      <Layout>
        <Router />
      </Layout>
      <Toaster />
    </FileVaultProvider>
  );
}

export default App;
