import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";

export const PROPERTY_LABELS = {
  title: "Title",
  author: "Author",
  subject: "Subject",
  keywords: "Keywords",
  creator: "Creator application",
  producer: "PDF producer",
} as const;
export type Properties = Record<keyof typeof PROPERTY_LABELS, string>;

export async function readProperties(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const properties: Properties = {
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    keywords: doc.getKeywords() ?? "",
    creator: doc.getCreator() ?? "",
    producer: doc.getProducer() ?? "",
  };
  return {
    properties,
    pages: doc.getPageCount(),
    created: doc.getCreationDate(),
    modified: doc.getModificationDate(),
  };
}

/** Do not serialize detached metadata packets or indirect property values. */
function discardUnreachableObjects(doc: PDFDocument) {
  const reachable = new Set<string>();
  const visit = (value: unknown): void => {
    if (value instanceof PDFRef) {
      const key = value.toString();
      if (reachable.has(key)) return;
      reachable.add(key);
      visit(doc.context.lookup(value));
    } else if (value instanceof PDFRawStream) visit(value.dict);
    else if (value instanceof PDFDict)
      for (const [, item] of value.entries()) visit(item);
    else if (value instanceof PDFArray)
      for (const item of value.asArray()) visit(item);
  };
  for (const root of Object.values(doc.context.trailerInfo)) visit(root);
  for (const [ref] of doc.context.enumerateIndirectObjects())
    if (!reachable.has(ref.toString())) doc.context.delete(ref);
}

export async function editProperties(
  bytes: Uint8Array,
  properties: Properties,
  options: { clearAll?: boolean; removeExtended?: boolean } = {},
) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const value of Object.values(properties)) {
    if (typeof value !== "string" || value.length > 4000)
      throw new Error(
        "Each document property must be 4,000 characters or fewer.",
      );
  }
  if (options.clearAll) {
    const info = doc.context.lookup(doc.context.trailerInfo.Info);
    if (info instanceof PDFDict)
      for (const key of info.keys()) info.delete(key);
  } else {
    doc.setTitle(properties.title);
    doc.setAuthor(properties.author);
    doc.setSubject(properties.subject);
    // Keep the user's keyword string intact instead of splitting quoted phrases.
    doc.setKeywords([properties.keywords]);
    doc.setCreator(properties.creator);
    doc.setProducer(properties.producer);
  }
  if (options.removeExtended || options.clearAll)
    doc.catalog.delete(PDFName.of("Metadata"));
  discardUnreachableObjects(doc);
  return doc.save({ useObjectStreams: true });
}
