/**
 * The FC letterhead as a Word document, so staff can type letters in Word
 * with the letterhead already in place. The letterhead sits in the
 * first-page header and footer (like printed letterhead paper); later pages
 * are plain with a page number. Built with the `docx` library (MIT) on this
 * device.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber, Paragraph, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType, TableLayoutType,
} from "docx";
import { ORG } from "@/fc/org";
import { loadLogo } from "./logo";
import type { Letter, LetterheadDetails } from "./letterhead";

const GREEN = "44AB4C";
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

const buildHeader = async (d: LetterheadDetails, ourRef?: string, yourRef?: string) => {
  const logo = await loadLogo();
  const refPara = (label: string, value?: string) =>
    new Paragraph({
      spacing: { before: 40, after: 0 },
      children: [
        new TextRun({ text: `${label} `, bold: true, italics: true, font: "Times New Roman", size: 19 }),
        new TextRun({ text: value?.trim() || "................................", font: "Times New Roman", size: 19 }),
      ],
    });

  const right: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: "FORESTRY COMMISSION", font: "Arial Black", bold: true, size: 38, color: GREEN, characterSpacing: 6 })],
    }),
  ];
  if (d.subtitle.trim()) {
    right.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: `(${d.subtitle.trim().toUpperCase()})`, font: "Times New Roman", bold: true, size: 30, color: GREEN })],
      })
    );
  }
  for (const line of d.lines.filter((l) => l.trim())) {
    right.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({ text: line.trim(), font: "Times New Roman", bold: true, size: 19 })],
      })
    );
  }

  return new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [3700, 6700],
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 3700, type: WidthType.DXA },
                borders: NO_BORDERS,
                children: [
                  new Paragraph({ children: [new ImageRun({ type: "png", data: logo, transformation: { width: 190, height: 90 } })] }),
                  refPara("Our Ref:", ourRef),
                  refPara("Your Ref:", yourRef),
                ],
              }),
              new TableCell({ width: { size: 6700, type: WidthType.DXA }, borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP, children: right }),
            ],
          }),
        ],
      }),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: "111111", space: 1 } }, children: [] }),
    ],
  });
};

const buildFooter = () =>
  new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 10, color: "111111", space: 4 } },
        children: [
          new TextRun({ text: "VISION: ", font: "Arial Black", bold: true, size: 20, color: GREEN }),
          new TextRun({ text: ORG.vision, font: "Book Antiqua", size: 18 }),
        ],
      }),
    ],
  });

const pageNumberFooter = () =>
  new Footer({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["- ", PageNumber.CURRENT, " -"], font: "Times New Roman", size: 20 })] })],
  });

const bodyFont = { font: "Times New Roman", size: 24 };

const letterParagraphs = (letter: Letter): Paragraph[] => {
  const out: Paragraph[] = [];
  const p = (text: string, opts: Record<string, unknown> = {}, run: Record<string, unknown> = {}) =>
    new Paragraph({ spacing: { after: 0 }, ...opts, children: [new TextRun({ text, ...bodyFont, ...run })] });

  if (letter.date.trim()) out.push(p(letter.date.trim(), { alignment: AlignmentType.RIGHT, spacing: { after: 280 } }));
  letter.recipient.split("\n").map((l) => l.trim()).filter(Boolean).forEach((l) => out.push(p(l)));
  out.push(p(""));
  if (letter.salutation.trim()) out.push(p(letter.salutation.trim(), { spacing: { after: 200 } }));
  if (letter.subject.trim()) {
    out.push(p(letter.subject.trim().toUpperCase(), { alignment: AlignmentType.CENTER, spacing: { after: 200 } }, { bold: true, underline: {} }));
  }
  letter.body
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\n/g, " ").trim())
    .filter(Boolean)
    .forEach((para) => out.push(p(para, { alignment: AlignmentType.JUSTIFIED, spacing: { after: 200, line: 300 } })));
  if (letter.closing.trim()) out.push(p(letter.closing.trim(), { spacing: { before: 120, after: 900 } }));
  if (letter.signatoryName.trim()) out.push(p(letter.signatoryName.trim().toUpperCase(), {}, { bold: true }));
  if (letter.signatoryTitle.trim()) out.push(p(letter.signatoryTitle.trim(), {}, { italics: true }));
  if (letter.forLine.trim()) out.push(p(`for: ${letter.forLine.trim().toUpperCase()}`, {}, { bold: true }));
  const cc = letter.cc.split("\n").map((l) => l.trim()).filter(Boolean);
  if (cc.length) {
    out.push(p("", { spacing: { after: 120 } }));
    out.push(p("cc:", {}, { bold: true, size: 22 }));
    cc.forEach((l) => out.push(p(l, { indent: { left: 600 } }, { size: 22 })));
  }
  return out;
};

/** A Word document with the letterhead; blank (a template) or with a letter already in it. */
export const letterheadDocx = async (d: LetterheadDetails, letter?: Letter): Promise<File> => {
  const firstHeader = await buildHeader(d, letter?.ourRef, letter?.yourRef);
  const everyPage = Boolean(letter?.letterheadOnEveryPage);
  const doc = new Document({
    creator: "Forestry Commission",
    title: letter?.subject?.trim() || "Forestry Commission letterhead",
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [
      {
        properties: {
          titlePage: !everyPage,
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 3200, bottom: 1500, left: 1440, right: 1440, header: 420, footer: 360 },
          },
        },
        headers: everyPage ? { default: firstHeader } : { first: firstHeader, default: new Header({ children: [new Paragraph("")] }) },
        footers: everyPage ? { default: buildFooter() } : { first: buildFooter(), default: pageNumberFooter() },
        children: letter ? letterParagraphs(letter) : [new Paragraph({ children: [new TextRun({ text: "", ...bodyFont })] })],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const base = letter ? (letter.subject.trim() || "Letter").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) : "FC_letterhead";
  return new File([blob], `${base}.docx`, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
};
