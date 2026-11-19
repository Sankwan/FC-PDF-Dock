/**
 * "How do I…" articles on /guides/<slug>. Each one starts from a job staff
 * need done (not from a tool), and can walk through several tools. Use the
 * words the buttons actually use, and update an article when a tool changes.
 */

export interface ArticleStep {
  text: string;
  /** tool id from ToolsSection: shows an "Open …" button on the step */
  tool?: string;
}

export interface ArticleSection {
  heading: string;
  text?: string;
  steps?: ArticleStep[];
}

export interface Article {
  slug: string;
  title: string;
  /** one line for the card and the top of the article */
  summary: string;
  /** tools used, in the order they're used */
  tools: string[];
  intro: string;
  why?: { heading: string; points: string[] };
  sections: ArticleSection[];
  tips?: string[];
  faqs?: { q: string; a: string }[];
  related: string[];
}

export const ARTICLES: Article[] = [
  {
    slug: "pdf-too-big-to-email",
    title: "My PDF is too big to email",
    summary: "Get a PDF under the email, WhatsApp or portal limit without losing the text.",
    tools: ["compress-pdf", "split-pdf"],
    intro:
      "Most work email accounts won't send attachments over 10 to 25 MB, WhatsApp documents are easier to open when they're small, and many online portals cap uploads at 2 or 5 MB. Compress PDF can usually get a file under the limit in one go. If it can't, split the file into parts that each fit.",
    why: {
      heading: "Why PDFs get big",
      points: [
        "Scanned pages and phone photos are stored as large pictures, often several MB per page.",
        "Reports with many photos, maps or charts carry each image at full camera quality.",
        "Text itself is tiny. A 50-page typed letter with no pictures is usually well under 1 MB.",
      ],
    },
    sections: [
      {
        heading: "Shrink it to a size you choose",
        steps: [
          { text: "Open Compress PDF and choose your file. The current size is shown.", tool: "compress-pdf" },
          { text: "Choose Fit under a size and tap the limit you need: 100 KB, 200 KB, 500 KB, 1 MB, 2 MB or 5 MB. You can also type your own." },
          { text: "Tap Compress to under … and wait. The result shows the new size and how much was saved." },
          { text: "Tap Save, or Share to send it straight to email or WhatsApp." },
        ],
      },
      {
        heading: "If it still won't fit",
        text: "Compress PDF will tell you if it can't reach the size. You then have two choices:",
        steps: [
          { text: "Turn pages into images when offered. The file gets much smaller, but the text can no longer be searched or copied. Fine for a scan, not ideal for a report people need to search." },
          { text: "Or split the file. Open Split PDF, choose By file size, type the limit (for example 5), and you'll get several parts that each fit. Send them in separate emails.", tool: "split-pdf" },
        ],
      },
    ],
    tips: [
      "Text stays sharp after compressing. Only photos and scanned pages are reduced.",
      "Compress the final version. If you sign or add pages afterwards, compress again.",
      "For a whole folder of documents, merge them first and compress once, so you only send one file.",
    ],
    faqs: [
      { q: "Will the document look worse?", a: "Typed text looks exactly the same. Photos and scans may look slightly softer if you choose a very small size like 100 KB. Check the result before sending." },
      { q: "Is my file uploaded to make it smaller?", a: "No. Compressing happens on your phone or computer. Nothing is sent anywhere until you tap Share yourself." },
    ],
    related: ["combine-documents-for-submission", "scan-and-send-signed-letter", "take-pages-out-of-report"],
  },
  {
    slug: "scan-and-send-signed-letter",
    title: "Scan a signed paper letter and send it as a PDF",
    summary: "Use your phone camera to turn a signed paper into a clean, small PDF, ready to send.",
    tools: ["scan", "compress-pdf"],
    intro:
      "A letter has been signed on paper and needs to go out by email today. You don't need a scanner: your phone camera and PDFDock will straighten the page, clean it up and save it as a PDF small enough to send.",
    sections: [
      {
        heading: "Before you start",
        text: "Lay the letter flat on a dark table or desk, in good light. Avoid shadows from your hand or phone falling across the page.",
      },
      {
        heading: "Scan the pages",
        steps: [
          { text: "Open Scan document and tap Scan your first page. Allow the camera if you're asked.", tool: "scan" },
          { text: "Hold the phone above the page. PDFDock finds the edges and straightens the page for you." },
          { text: "Tap Keep and scan next for each further page, or Done after the last one." },
          { text: "Check the pages. Drag to put them in order, and retake any that are blurred." },
          { text: "Tick Make text searchable if people will need to search or copy the text later." },
          { text: "Name the file (for example the reference number) and save." },
        ],
      },
      {
        heading: "Make it small enough and send",
        steps: [
          { text: "Under Keep going with this file, tap Compress. The scan opens there already loaded.", tool: "compress-pdf" },
          { text: "Choose Fit under a size, pick 2 MB (or the limit you need), and tap Compress to under 2 MB." },
          { text: "Tap Share to send it by email or WhatsApp, or Save to keep it." },
        ],
      },
    ],
    tips: [
      "Scanning more than one page? Do them all in one go so they end up in a single PDF.",
      "If the page came out sideways, use Organise pages to rotate it.",
      "Scans already made on a photocopier can go straight to Compress PDF.",
    ],
    faqs: [
      { q: "Is a scanned signature acceptable?", a: "That depends on who you're sending it to. Many offices accept a scanned signed letter; some still ask for the original. If in doubt, ask the recipient." },
      { q: "Can I scan on a computer?", a: "Scan document works best on a phone. On a computer, take photos of the pages and use Image to PDF instead." },
    ],
    related: ["pdf-too-big-to-email", "sign-and-send-back", "make-scan-searchable"],
  },
  {
    slug: "sign-and-send-back",
    title: "Sign a letter or form and send it back",
    summary: "Add your signature, the date and any ticks to a PDF, without printing it.",
    tools: ["sign-pdf", "edit-pdf", "compress-pdf"],
    intro:
      "Someone has sent you a PDF to sign. You don't need to print it, sign it and scan it back. Sign PDF puts your signature on the page, and you can add the date, initials or ticks at the same time.",
    sections: [
      {
        heading: "Sign the document",
        steps: [
          { text: "Open Sign PDF and choose the file you were sent.", tool: "sign-pdf" },
          { text: "Create your signature: draw it with your finger or mouse, type your name, or take a photo of your signature on white paper." },
          { text: "Tap the page where it should go. Drag it into place and use the dot in the corner to make it bigger or smaller." },
          { text: "Add the date or your initials on other pages if the form asks for them." },
          { text: "Check the preview, then save." },
        ],
      },
      {
        heading: "Fill in the rest of a form",
        text: "If the form also needs ticks, names or other text written in, use Edit PDF on the same file.",
        steps: [
          { text: "Open Edit PDF, choose the file, and pick text, tick or date from the toolbar.", tool: "edit-pdf" },
          { text: "Tap where each one should go, type, and save." },
        ],
      },
      {
        heading: "Send it back",
        steps: [
          { text: "Tap Share after saving to reply by email or WhatsApp." },
          { text: "If the file is too large to send, tap Compress under Keep going with this file.", tool: "compress-pdf" },
        ],
      },
    ],
    tips: [
      "Your signature is kept on this device, so next time you can place it without drawing it again.",
      "PDFDock records a fingerprint when you sign. Open a signed file in Sign PDF later to check whether its pages were changed after signing.",
    ],
    faqs: [
      { q: "Is this a legal digital signature?", a: "It's a visible signature, like signing on paper. It isn't a certificate-based digital signature. Most internal letters and forms only need a visible signature; check with the recipient for contracts." },
      { q: "Can someone copy my signature from the PDF?", a: "Anyone with the file can see it, just like a signed paper. Only sign documents you intend to send, and use Protect PDF to stop editing if you're worried." },
    ],
    related: ["scan-and-send-signed-letter", "pdf-too-big-to-email", "remove-personal-details"],
  },
  {
    slug: "combine-documents-for-submission",
    title: "Combine several documents into one file for a submission",
    summary: "Turn a Word letter, scanned certificates and photos into one numbered PDF, in the right order.",
    tools: ["word-to-pdf", "image-to-pdf", "merge-pdfs", "page-numbers", "compress-pdf"],
    intro:
      "Applications, reports to head office and procurement bids often ask for everything in a single PDF: a cover letter, forms, certificates, photos. This guide turns each piece into a PDF, puts them in order, numbers the pages and gets the file under the upload limit.",
    sections: [
      {
        heading: "1. Turn everything into PDFs",
        steps: [
          { text: "Word documents: open Word to PDF, choose the .docx file and tap Convert.", tool: "word-to-pdf" },
          { text: "Spreadsheets: use Excel to PDF the same way.", tool: "excel-to-pdf" },
          { text: "Photos or pictures of certificates: open Image to PDF and choose them all at once.", tool: "image-to-pdf" },
          { text: "Paper documents: scan them with Scan document.", tool: "scan" },
        ],
      },
      {
        heading: "2. Put them together in order",
        steps: [
          { text: "Open Merge PDFs and choose all the PDFs.", tool: "merge-pdfs" },
          { text: "Drag the files into the order the submission asks for. On a phone, press and hold, then drag." },
          { text: "To remove a blank page or turn one the right way up, tap Arrange, rotate or remove pages first." },
          { text: "Name the file and tap Merge PDFs, then save." },
        ],
      },
      {
        heading: "3. Number the pages and check the size",
        steps: [
          { text: "Under Keep going with this file, tap Page numbers. Choose where they go and a format such as Page 1 of 9, then save.", tool: "page-numbers" },
          { text: "If the portal has an upload limit, tap Compress and choose Fit under a size.", tool: "compress-pdf" },
        ],
      },
    ],
    tips: [
      "Need a reference number or \"Annex B\" on every page as well? Use Headers & footers instead of Page numbers.",
      "Merge first, number last. If you number each file separately, the numbers start again at 1 in each part.",
    ],
    faqs: [
      { q: "Can I add more files after merging?", a: "Yes. Tap Merge more, or open Merge PDFs again with the merged file and the new one." },
      { q: "Will the Word document keep its layout?", a: "Word to PDF keeps fonts, tables and pictures. Check the result for unusual fonts; if something looks off, save as PDF from Word itself and merge that instead." },
    ],
    related: ["pdf-too-big-to-email", "number-every-page", "convert-word-excel-pdf"],
  },
  {
    slug: "take-pages-out-of-report",
    title: "Take some pages out of a large report",
    summary: "Send only the pages people need, or break a long report into its chapters.",
    tools: ["split-pdf", "organize-pdf"],
    intro:
      "You only need to send pages 12 to 18 of a 200-page report, or each district's section to that district. Split PDF makes a new file with just those pages, and leaves the original untouched.",
    sections: [
      {
        heading: "Make one file with the pages you need",
        steps: [
          { text: "Open Split PDF and choose the report.", tool: "split-pdf" },
          { text: "Tap the pages you want in the preview, or type them, for example 12-18 or 3, 7, 20-25." },
          { text: "Choose one PDF with those pages." },
          { text: "Tap Split and save." },
        ],
      },
      {
        heading: "Break it into several files",
        steps: [
          { text: "Type each part as a range, separated by commas (for example 1-20, 21-45, 46-), or choose to cut every few pages." },
          { text: "Choose a PDF for each part. The list shows every file it will make." },
          { text: "Tap Split, then save each file, or Save all as one ZIP." },
        ],
      },
      {
        heading: "Remove a few pages instead",
        text: "If you want to keep most of the report and just drop or reorder a few pages, Organise pages is quicker.",
        steps: [
          { text: "Open Organise pages, tap the pages to remove, delete them and save.", tool: "organize-pdf" },
        ],
      },
    ],
    tips: [
      "A range ending in a dash, like 46-, means \"page 46 to the end\".",
      "The new file keeps the original text, links and quality.",
    ],
    related: ["pdf-too-big-to-email", "combine-documents-for-submission", "number-every-page"],
  },
  {
    slug: "number-every-page",
    title: "Add page numbers or a reference to every page",
    summary: "Number pages, or put a file reference, department or \"Confidential\" on every page.",
    tools: ["page-numbers", "headers-footers"],
    intro:
      "Pages that get printed and shuffled, or a document that will be quoted in a meeting, need numbers. Official files often also need the reference number or classification on every page. PDFDock has a quick tool for each.",
    sections: [
      {
        heading: "Just page numbers",
        steps: [
          { text: "Open Add page numbers and choose your PDF.", tool: "page-numbers" },
          { text: "Pick one of six positions, and a format: 1, Page 1, 1 of 9 or Page 1 of 9." },
          { text: "Check the preview and save." },
        ],
      },
      {
        heading: "A reference number, classification or more",
        steps: [
          { text: "Open Headers & footers and choose your PDF.", tool: "headers-footers" },
          { text: "Tap a quick start such as Reference no., Confidential or Page X of Y, or type in any of the six boxes at the top and bottom." },
          { text: "To add the page number, total pages, date or file name, tap a box and then the matching button below it." },
          { text: "For an annex that continues another document, set Numbering › Start at (for example 45)." },
          { text: "Tick Leave the first page (cover) blank if the cover should stay clean." },
          { text: "Check a few pages in the preview and tap Add to … pages." },
        ],
      },
    ],
    tips: [
      "If you're warned that the text would print over the document's own footer, move it closer to the edge or choose another box.",
      "Do this last, after merging and removing pages, so the numbers are right.",
    ],
    related: ["combine-documents-for-submission", "take-pages-out-of-report", "remove-personal-details"],
  },
  {
    slug: "pdf-wont-open",
    title: "Fix a PDF that won't open or shows blank pages",
    summary: "What to try when a PDF gives an error, opens blank, or asks for a password.",
    tools: ["repair-pdf", "ocr-pdf"],
    intro:
      "A PDF that won't open is usually damaged during download or copying, or was saved badly by another program. Repair PDF can rebuild most of them. Here's what to try, in order.",
    why: {
      heading: "Common causes",
      points: [
        "The download or email attachment didn't finish, so the end of the file is missing.",
        "The file was copied from a flash drive that was pulled out too soon.",
        "Another program saved it in a slightly broken way. Some readers cope, others show errors or blank pages.",
        "It's password-protected, so it can't be opened without the password.",
      ],
    },
    sections: [
      {
        heading: "First, check the simple things",
        steps: [
          { text: "Download the file again, or ask the sender to resend it. A half-finished download is the most common cause." },
          { text: "If you're asked for a password, you need it from whoever made the file. PDFDock can't open a file without its password." },
        ],
      },
      {
        heading: "Repair the file",
        steps: [
          { text: "Open Repair PDF and choose the damaged file.", tool: "repair-pdf" },
          { text: "PDFDock first tries to rebuild the file without losing anything. If that fails, it saves every page it can still read." },
          { text: "Save the repaired copy. The result says which method worked and how many pages were recovered." },
        ],
      },
      {
        heading: "Pages open but the text can't be selected",
        text: "That isn't damage: the pages are scans, which are pictures of text. Run OCR PDF to make the text searchable and copyable.",
        steps: [{ text: "Open OCR PDF, choose the file, and tap Run OCR.", tool: "ocr-pdf" }],
      },
    ],
    tips: ["Your original file is never changed. Repair always saves a new copy.", "If nothing can be recovered, the file itself is too damaged. Ask for another copy."],
    related: ["make-scan-searchable", "pdf-too-big-to-email", "scan-and-send-signed-letter"],
  },
  {
    slug: "pdf-table-to-excel",
    title: "Put a PDF table into Excel and check the totals",
    summary: "Turn inventories, schedules and budgets in a PDF into a spreadsheet you can work with.",
    tools: ["pdf-to-excel", "ocr-pdf"],
    intro:
      "Retyping a table from a PDF is slow and mistakes creep in. PDF to Excel finds the tables, joins ones that carry over several pages, and turns amounts and dates into real numbers so Excel can add them up.",
    sections: [
      {
        heading: "Get the table out",
        steps: [
          { text: "Open PDF to Excel and choose your PDF. Tables are found automatically and shown in a preview.", tool: "pdf-to-excel" },
          { text: "Check each table. A table that runs over several pages is joined, and the repeated headings are dropped." },
          { text: "If a table is missing, tap Draw a box around it and drag over it on the page." },
        ],
      },
      {
        heading: "Tidy it up",
        steps: [
          { text: "Tap a column letter to join it with the next one or delete it." },
          { text: "Tap a row number to delete it, or to say the headings start there." },
          { text: "Made a mistake? Tap Undo." },
        ],
      },
      {
        heading: "Check the totals, then save",
        steps: [
          { text: "If a Total row doesn't add up, you'll see a warning. Compare that figure against the PDF; it's usually a misread digit." },
          { text: "Tap Create Excel file and save." },
        ],
      },
      {
        heading: "Scanned tables",
        text: "If the PDF is a scan, no tables are found because there's no text yet. Run OCR PDF first, then use PDF to Excel on the result.",
        steps: [{ text: "Open OCR PDF and tap Run OCR.", tool: "ocr-pdf" }],
      },
    ],
    tips: [
      "Amounts in GH₵ and dates like 12/03/2025 arrive as real numbers and dates, so sums and sorting work straight away.",
      "Tables from scans are worth checking line by line. OCR can misread figures.",
    ],
    related: ["make-scan-searchable", "convert-word-excel-pdf", "pdf-wont-open"],
  },
  {
    slug: "convert-word-excel-pdf",
    title: "Turn a Word or Excel file into a PDF, and back",
    summary: "Make a PDF from Word, Excel or PowerPoint, or get an editable Word file from a PDF.",
    tools: ["word-to-pdf", "excel-to-pdf", "powerpoint-to-pdf", "pdf-to-word", "pdf-to-excel"],
    intro:
      "A PDF looks the same on every phone and computer, so it's the right format for sending final documents. When you receive a PDF that you need to change, you can turn it back into Word or Excel.",
    sections: [
      {
        heading: "Word, Excel or PowerPoint to PDF",
        steps: [
          { text: "Open Word to PDF, Excel to PDF or PowerPoint to PDF.", tool: "word-to-pdf" },
          { text: "Choose the file (.docx, .xlsx or .pptx) and tap Convert." },
          { text: "Check the result and save." },
        ],
      },
      {
        heading: "PDF to Word",
        steps: [
          { text: "Open PDF to Word and choose your PDF.", tool: "pdf-to-word" },
          { text: "Choose editable text if you need to change the wording. Choose keep each page as a picture if it must look exactly the same." },
          { text: "Tap Convert to Word and download the file." },
        ],
      },
      {
        heading: "PDF to Excel",
        text: "For tables, use PDF to Excel instead of PDF to Word. It keeps rows and columns, and turns amounts into numbers.",
        steps: [{ text: "Open PDF to Excel.", tool: "pdf-to-excel" }],
      },
    ],
    tips: [
      "The Word, Excel and PowerPoint to PDF converter downloads once (about 47 MB) and then works offline.",
      "Excel to PDF shows the values Excel last saved. If formulas have changed, open and save the file in Excel first.",
      "Older .doc and .xls files: open and save them as .docx or .xlsx first.",
    ],
    related: ["pdf-table-to-excel", "combine-documents-for-submission", "make-scan-searchable"],
  },
  {
    slug: "make-scan-searchable",
    title: "Make a scanned document searchable or copyable",
    summary: "Find words in a scan, copy its text, or get it as a Word file.",
    tools: ["ocr-pdf", "pdf-to-word"],
    intro:
      "A scanned PDF is a picture of each page, so you can't search it, copy from it, or have it read aloud. OCR (text recognition) reads the words on each page and adds them to the PDF invisibly, so it looks the same but now has real text.",
    sections: [
      {
        heading: "Make the PDF searchable",
        steps: [
          { text: "Open OCR PDF and choose the scanned file.", tool: "ocr-pdf" },
          { text: "Tap Run OCR and wait while each page is read. Long documents take a few minutes." },
          { text: "Save the searchable PDF. You can now search it, select text and copy it." },
        ],
      },
      {
        heading: "Just want the text?",
        steps: [
          { text: "After OCR, download the text as a .txt or Word file instead of the PDF." },
          { text: "Or open PDF to Word and tick the option to recognise text in scanned pages.", tool: "pdf-to-word" },
        ],
      },
    ],
    tips: [
      "The first time, the OCR engine downloads once (about 9 MB).",
      "Clean, straight scans give the best results. Check names, numbers and amounts in the text afterwards.",
      "Scanning with Scan document? Tick Make text searchable and you can skip this step.",
      "Once a scan has text, Compare PDFs, PDF to Excel and Read PDF can all use it.",
    ],
    related: ["pdf-table-to-excel", "listen-to-report", "pdf-wont-open"],
  },
  {
    slug: "remove-personal-details",
    title: "Remove personal details before sharing",
    summary: "Permanently remove Ghana Card numbers, phone numbers and names from a PDF.",
    tools: ["redact-pdf", "watermark-pdf", "protect-pdf"],
    intro:
      "Before a document goes outside your office, to a contractor, the public or the press, personal details such as Ghana Card numbers, phone numbers and names may need to come out. Drawing a black box in a PDF editor isn't enough: the text is often still underneath and can be copied out. Redact PDF really removes it.",
    sections: [
      {
        heading: "Redact the details",
        steps: [
          { text: "Open Redact PDF and choose your file.", tool: "redact-pdf" },
          { text: "Use Find and redact to find Ghana Card numbers, phone numbers or email addresses automatically, or type names to find them." },
          { text: "Draw boxes over anything else, such as signatures, photos or stamps." },
          { text: "Check the To be removed list, then apply." },
          { text: "PDFDock checks the result. If any of the removed text still appears elsewhere, you're told where." },
        ],
      },
      {
        heading: "Mark it and control who opens it",
        steps: [
          { text: "Add a watermark such as CONFIDENTIAL or COPY with Watermark.", tool: "watermark-pdf" },
          { text: "Add a password with Protect PDF, and send the password separately, not in the same email.", tool: "protect-pdf" },
        ],
      },
    ],
    tips: [
      "Keep Remove hidden information ticked. It also strips the author's name, title and attachments that aren't visible on the page.",
      "Keep your original. Redaction can't be undone in the saved copy.",
      "Scans: run OCR PDF first so Find and redact can find the text, or draw boxes by hand.",
    ],
    faqs: [
      { q: "Can someone undo the redaction?", a: "No. The text, images and drawings under each box are removed from the file, not covered up." },
    ],
    related: ["sign-and-send-back", "number-every-page", "make-scan-searchable"],
  },
  {
    slug: "listen-to-report",
    title: "Listen to a long report instead of reading it",
    summary: "Have a PDF read aloud on your phone or computer, with each sentence highlighted.",
    tools: ["read-pdf", "ocr-pdf"],
    intro:
      "Long reports, policies and circulars are easier to get through when you can listen while travelling or resting your eyes. Read PDF reads the document aloud and highlights each sentence as it goes, so you can follow along or look up whenever you like.",
    sections: [
      {
        heading: "Start listening",
        steps: [
          { text: "Open Read PDF and choose the file.", tool: "read-pdf" },
          { text: "Scroll to where you want to start and tap Listen from page … . The sentence being read is highlighted." },
          { text: "Use the buttons to pause, go back a sentence or skip ahead. Tap any sentence to jump to it." },
          { text: "Change the speed from 0.75× to 2×." },
        ],
      },
      {
        heading: "Choose a voice",
        steps: [
          { text: "Voices On this device start straight away and need no download." },
          { text: "For a more natural, human-sounding voice, choose a Natural voice and tap Get natural voice. It downloads once (92 MB, best on Wi-Fi) and then works offline." },
        ],
      },
      {
        heading: "Just reading?",
        text: "Read PDF is also a comfortable reader. On a phone, switch to Text for large, easy-to-read text that fits the screen.",
      },
    ],
    tips: [
      "Next time you open the same file, it offers to carry on where you stopped.",
      "Scanned pages have nothing to read aloud. Run OCR PDF first.",
      "Everything stays on your device. The text isn't sent anywhere to be spoken.",
    ],
    related: ["make-scan-searchable", "take-pages-out-of-report", "pdf-wont-open"],
  },
];

export const articleFor = (slug: string) => ARTICLES.find((a) => a.slug === slug);

/** articles that use a tool, for the tool guide cards */
export const articlesUsing = (toolId: string) => ARTICLES.filter((a) => a.tools.includes(toolId));

/** rough minutes to read, at about 200 words a minute */
export const readMinutes = (a: Article) => {
  const words = [a.intro, ...(a.why?.points ?? []), ...a.sections.flatMap((s) => [s.text ?? "", ...(s.steps ?? []).map((x) => x.text)]), ...(a.tips ?? []), ...(a.faqs ?? []).flatMap((f) => [f.q, f.a])]
    .join(" ")
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
};

export const articleText = (a: Article) =>
  `${a.title} ${a.summary} ${a.intro} ${a.sections.map((s) => `${s.heading} ${s.text ?? ""} ${(s.steps ?? []).map((x) => x.text).join(" ")}`).join(" ")} ${(a.tips ?? []).join(" ")}`.toLowerCase();
