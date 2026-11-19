/**
 * How-to guides for each tool, shown on /guides and linked from every tool
 * page ("How to use this tool"). Keep steps short, in the words the buttons
 * actually use, and update them when a tool's screen changes.
 */

export interface Guide {
  /** matches the tool id in ToolsSection */
  id: string;
  /** one line: when you'd use it */
  when: string;
  steps: string[];
  tips?: string[];
}

export const GUIDES: Guide[] = [
  // ---- Official documents ----
  {
    id: "letterhead",
    when: "Write an official letter on the FC letterhead, put the letterhead on a PDF you already have, or get a blank letterhead for Word.",
    steps: [
      "Choose what you want: write a letter, add the letterhead to an existing PDF, or download a blank letterhead.",
      "To write a letter, fill in the boxes: Our Ref, Your Ref, Subject, the letter itself, Closing and Signed by.",
      "Check the preview, then save the PDF (or the Word file for the blank letterhead).",
    ],
    tips: ["Adding the letterhead to a PDF works best on a letter saved from Word without one.", "Use Sign PDF afterwards to add your signature."],
  },
  {
    id: "watermark-pdf",
    when: "Mark every page CONFIDENTIAL, DRAFT, CERTIFIED TRUE COPY or your own words.",
    steps: [
      "Choose your PDF.",
      "Tap a ready-made word or type your own.",
      "Pick a layout: Diagonal, Straight or Tiled (repeated across the page), then a colour, strength and size.",
      "The preview shows exactly how the page will look. Tap Add watermark, then Save or Share.",
    ],
    tips: ["Tiled is hardest to crop out of a copy.", "Characters like ₵ and ɛ aren't in the PDF font; they're swapped for GH¢ and e, and you're told when that happens."],
  },
  {
    id: "headers-footers",
    when: "Put a reference number, department, date, classification or page numbers at the top and bottom of every page.",
    steps: [
      "Choose your PDF.",
      "Tap a quick start (Page X of Y, File name & date, Forestry Commission, Confidential or Reference no.) or type in any of the six boxes: left, centre and right, at the top and bottom.",
      "To add the page number, total pages, today's date or the file name, tap a box, then tap the matching button under the boxes.",
      "Check the preview on a few pages, then tap Add to … pages and save.",
    ],
    tips: [
      "If you're warned that it would print over the document's own text, move it closer to the edge, use small text, or pick a different box.",
      "For an annex, set Numbering › Start at (for example 45). Choose 0001 for reference numbers.",
      "Tick Leave the first page (cover) blank, and Don't count the cover if the next page should be page 1.",
    ],
  },
  {
    id: "compare-pdf",
    when: "See exactly what changed between two versions of a letter, contract or report.",
    steps: [
      "Add the original as the first file and the revised version as the second.",
      "Read the list of changes. Removed words are red, added words are green.",
      "Use the filters to see only changes, additions, removals, or Numbers & \"not\": changes most worth a second look.",
      "Tap a change to see it on both pages. On a phone, switch between Original and Revised.",
      "Save highlighted copies if you want to send the marked-up versions.",
    ],
    tips: ["Compare reads the words, not the layout. Scanned files need OCR PDF first."],
  },
  {
    id: "edit-pdf",
    when: "Change text, or add ticks, dates, stamps, drawings and signatures to a PDF.",
    steps: [
      "Choose your PDF.",
      "Pick a tool from the toolbar (text, signature, tick, date, stamp, draw) and tap where it should go.",
      "Drag to move, use the corner dot to resize, and tap × to remove.",
      "Tap Preview to see the page without editing marks, then save.",
    ],
    tips: ["Your work is kept as a draft on this device for 24 hours if you leave the page."],
  },
  {
    id: "sign-pdf",
    when: "Sign a letter or form: draw, type or photograph your signature.",
    steps: [
      "Choose your PDF.",
      "Create your signature: draw it with your finger or mouse, type your name, or take a photo of it on white paper.",
      "Tap the page where it should go. Drag to move it and use the dot to resize it.",
      "Add the date or initials if needed, check the preview, then save.",
    ],
    tips: [
      "This is a visible signature, not a certificate-based digital signature.",
      "PDFDock records a fingerprint when you sign. Open a signed file in Sign PDF later to check whether its pages were changed after signing.",
    ],
  },
  {
    id: "fill-form",
    when: "Fill in a form that has its own boxes, such as HR, leave or procurement forms, without printing it.",
    steps: [
      "Choose the PDF form. Its boxes are found automatically.",
      "Fill in the answers. Form shows them as a simple list (easiest on a phone); On the page lets you type straight into the blue boxes.",
      "Leave Lock the answers into the page ticked if you're sending it, so the answers show in every app and can't be changed.",
      "Tap Save filled form, then Save or Share. To sign it, tap Sign under Keep going with this file.",
    ],
    tips: [
      "If it says there are no boxes to fill in, the form is a scan or was saved without fillable fields. Tap Fill it in Edit PDF to type on it instead.",
      "Answers aren't kept if you leave the page, so save before closing. Also save an editable copy if you'll reuse the form.",
    ],
  },
  {
    id: "redact-pdf",
    when: "Permanently remove Ghana Card numbers, phone numbers, names and other details before sharing.",
    steps: [
      "Choose your PDF.",
      "Use Find and redact to find Ghana Card numbers, phone numbers, emails or names you type in; or draw boxes over anything else.",
      "Check the To be removed list, then apply.",
      "PDFDock checks the result. If any redacted text still appears elsewhere, you're told where.",
    ],
    tips: ["Redaction really removes the text underneath, unlike drawing a black box in Edit PDF.", "Keep Remove hidden information ticked to also strip the author, title and attachments."],
  },
  {
    id: "protect-pdf",
    when: "Add a password, or stop others printing, copying or editing.",
    steps: [
      "Choose your PDF.",
      "Type a password twice. Anyone opening the file will need it.",
      "Optionally tick Restrict printing, copying and editing and choose what's still allowed.",
      "Tap Protect PDF and save. Share the password separately, not in the same email.",
    ],
    tips: ["If you forget the password, PDFDock can't recover it."],
  },
  {
    id: "qr-codes",
    when: "Create a QR code for a link or text, or read a QR code from a photo.",
    steps: [
      "Choose Create a code and type the link or text, or choose Read a code and pick a photo of the code.",
      "Save the QR image, or copy the text it contains.",
    ],
  },

  // ---- Organise ----
  {
    id: "merge-pdfs",
    when: "Combine several PDFs into one file.",
    steps: [
      "Choose two or more PDFs.",
      "Put them in order: drag a file up or down (on a phone, press and hold, then drag).",
      "Each file shows its page count. To rearrange, rotate or remove individual pages first, tap Arrange, rotate or remove pages first.",
      "Name the file and tap Merge PDFs, then Save or Share.",
    ],
  },
  {
    id: "split-pdf",
    when: "Take some pages out, or break a PDF into separate files.",
    steps: [
      "Choose your PDF.",
      "Pick how: tap the pages you want, type ranges like 1-3, 7, 12-, cut every few pages, or split by file size.",
      "Choose whether you want one PDF with those pages or a PDF for each part. The list shows every file it will make.",
      "Tap Split, then save each file or Save all as one ZIP.",
    ],
    tips: ["By file size is handy when an email or portal has a limit, such as 5 MB."],
  },
  {
    id: "organize-pdf",
    when: "Reorder, rotate, delete or copy pages, with a picture of every page.",
    steps: [
      "Choose one PDF, or several to arrange together.",
      "Drag pages into order (press and hold on a phone). Tap a page to select it, then rotate, copy or delete it.",
      "Add a blank page if you need one, then save.",
    ],
    tips: ["Undo puts back your last change.", "Text and quality stay exactly as they were."],
  },
  {
    id: "remove-blank-pages",
    when: "Remove the empty backs left by double-sided scanning, or blank pages in any PDF.",
    steps: [
      "Choose your PDF. Every page is checked and the blank ones are marked Remove.",
      "Glance over the pages. Tap any page to keep it or remove it.",
      "If too many or too few were found, change What counts as blank.",
      "Tap Remove, then Save or Share.",
    ],
    tips: ["Faint show-through from the other side and dust don't count as content.", "Pages that only say \"This page is intentionally left blank\" can be removed too."],
  },
  {
    id: "compress-pdf",
    when: "Make a PDF small enough for email or WhatsApp.",
    steps: [
      "Choose your PDF.",
      "Either choose a strength, or choose Fit under a size and tap the limit you need (for example 2 MB).",
      "Tap Compress PDF (or Compress to under 2 MB, if you picked a size), then Save or Share.",
    ],
    tips: [
      "Text stays sharp and searchable. Only photos are shrunk.",
      "If it can't get small enough, you can turn pages into images (smaller, but text can't be searched) or split the file by size.",
    ],
  },
  {
    id: "page-numbers",
    when: "Number the pages of a PDF.",
    steps: ["Choose your PDF.", "Pick where the numbers go (six positions) and how they read: 1, Page 1, 1 of 9 or Page 1 of 9.", "Check the preview and save."],
    tips: ["For reference numbers or numbering that starts at 45, use Headers & footers."],
  },
  {
    id: "crop-pdf",
    when: "Cut away scan borders and empty margins, or put every page on the same paper size.",
    steps: [
      "Choose your PDF.",
      "Crop margins: tap Trim white margins automatically, or drag the green handles on the preview, or type millimetres.",
      "Paper size: pick A4, Letter and so on, or 2 or 4 pages per sheet to save paper.",
      "Tap the button at the bottom and save.",
    ],
    tips: [
      "After automatic trimming, choose Same size for every page to keep pages one size.",
      "Cropping hides the cut-off part. Tick Remove the cut-off part completely if it must really be gone (pages become images).",
    ],
  },
  {
    id: "repair-pdf",
    when: "Fix a PDF that won't open, shows errors or has blank pages.",
    steps: ["Choose the damaged PDF.", "PDFDock tries to rebuild it without losing anything; if that fails, it saves each readable page.", "Save the repaired file. The result says which method worked."],
    tips: ["Your original file is never changed."],
  },

  // ---- Scan & convert ----
  {
    id: "read-pdf",
    when: "Read a PDF on your phone or computer, or listen to it with each sentence highlighted.",
    steps: [
      "Choose your PDF. Scroll to read, zoom in, or switch to Text for large, easy-to-read text on a phone.",
      "Tap Listen to hear it read aloud from the page you're on. The sentence being read is highlighted.",
      "Use the buttons to pause, go back or skip a sentence, change the speed, or tap any sentence to jump to it.",
      "Choose a voice: your device's voices work straight away; the natural voice sounds more human and downloads once (92 MB).",
    ],
    tips: ["Next time you open the same file, it offers to carry on where you stopped.", "Scanned pages have no text to read aloud. Run OCR PDF first."],
  },
  {
    id: "scan",
    when: "Use your phone camera to turn papers into a clean PDF.",
    steps: [
      "Tap Scan your first page and point the camera at the paper. The edges are found and the page is straightened.",
      "Tap Keep and scan next for more pages, or Done if that's all.",
      "Drag pages to reorder them, name the file and save or share.",
    ],
    tips: ["Lay the paper on a dark surface in good light.", "Tick Make text searchable to be able to search and copy the text later."],
  },
  {
    id: "image-to-pdf",
    when: "Turn photos and images (including iPhone HEIC) into a PDF.",
    steps: ["Choose one or more images.", "Pick the page size and orientation.", "Tap Convert, then Save or Share."],
  },
  {
    id: "pdf-to-image",
    when: "Save PDF pages as JPG, PNG or WebP pictures.",
    steps: ["Choose your PDF.", "Pick all pages or a range, and the image type and quality.", "Tap Convert, then save the images (several come as one ZIP)."],
  },
  {
    id: "word-to-pdf",
    when: "Convert a Word document (.docx) to PDF.",
    steps: ["Choose the .docx file.", "Tap Convert and save the PDF."],
    tips: ["The converter downloads once (about 47 MB) and then works offline."],
  },
  { id: "powerpoint-to-pdf", when: "Convert PowerPoint slides (.pptx) to PDF.", steps: ["Choose the .pptx file.", "Tap Convert and save the PDF."] },
  {
    id: "excel-to-pdf",
    when: "Convert a spreadsheet (.xlsx) to PDF.",
    steps: ["Choose the .xlsx file.", "Tap Convert and save the PDF."],
    tips: ["It shows the values Excel last saved. Open and save the file in Excel first if formulas changed."],
  },
  {
    id: "pdf-to-word",
    when: "Get an editable Word document from a PDF.",
    steps: ["Choose your PDF (up to 50 MB and 100 pages).", "Choose editable text, or keep each page as a picture.", "Tap Convert to Word and download the Word file."],
    tips: ["For scanned pages, tick the option to recognise text, then check names and figures in the result."],
  },
  {
    id: "pdf-to-excel",
    when: "Pull tables such as inventories, schedules and budgets into a spreadsheet.",
    steps: [
      "Choose your PDF. Tables are found automatically and shown in a preview.",
      "Fix anything that's off: tap a column letter to join or delete it, or a row number to delete it or say the headings start there.",
      "If a table is missing, tap Draw a box around it and drag over the table on the page.",
      "Tap Create Excel file and save.",
    ],
    tips: [
      "Tables that carry on over the next page are joined, and repeated headings dropped.",
      "If you're warned a total doesn't add up, check that figure against the PDF; it's often a misread digit.",
      "Amounts in GH₵ and dates like 12/03/2025 become real numbers and dates in Excel.",
    ],
  },
  {
    id: "ocr-pdf",
    when: "Make a scanned PDF searchable, so you can find and copy its text.",
    steps: ["Choose the scanned PDF.", "Tap Run OCR and wait while each page is read.", "Save the searchable PDF, or download the text as a .txt or Word file."],
    tips: ["The first time, the OCR engine downloads once (about 9 MB)."],
  },
  {
    id: "convert-images",
    when: "Change HEIC, TIFF and other images to JPG, PNG or WebP.",
    steps: ["Choose the images.", "Pick the format and quality.", "Save the converted images."],
  },
];

export const guideFor = (id: string) => GUIDES.find((g) => g.id === id);

export interface Faq { q: string; a: string; link?: { href: string; label: string } }

export const FAQS: Faq[] = [
  { q: "Are my documents uploaded anywhere?", a: "No. PDFDock does the work inside your browser on this phone or computer. Your files aren't sent to a server or kept by PDFDock. Signing in only checks that you're FC staff." },
  { q: "Where does my file go when I tap Save?", a: "To your Downloads folder. On iPhone, open the Files app › Downloads (Safari may ask you to confirm first). On Android, open Files or Downloads. Share sends it straight to WhatsApp, email or Drive." },
  { q: "The file is too big to email.", a: "Use Compress PDF and choose Fit under a size (for example 5 MB). If it still won't fit, split it by file size.", link: { href: "/compress-pdf", label: "Compress PDF" } },
  { q: "My PDF won't open or shows errors.", a: "Try Repair PDF. It rebuilds the file without changing your original.", link: { href: "/repair-pdf", label: "Repair PDF" } },
  { q: "It says the PDF is password-protected.", a: "You'll be asked for the password when you add the file. If you don't have it, ask whoever sent the file." },
  { q: "I can't select or search the text in a scan.", a: "A scan is a picture of the page. Run OCR PDF to make the text searchable; then Compare, PDF to Excel and Read PDF can use it.", link: { href: "/ocr-pdf", label: "OCR PDF" } },
  { q: "Does PDFDock work without internet?", a: "Yes, once it has loaded. Add it to your home screen, and open the menu › Set up offline access while connected so the bigger engines (Word conversion, OCR, scanner) are ready offline." },
  { q: "Is a signature from Sign PDF legally a digital signature?", a: "It's a visible signature, like signing on paper. It isn't a certificate-based digital signature. PDFDock can check whether a file signed here was changed afterwards." },
  { q: "Can I do several things to one file?", a: "Yes. When a tool finishes, use Keep going with this file to open the next tool (for example Sign, then Compress) with the result already loaded." },
];
