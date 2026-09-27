import { brand } from "@/brand";

/** The FC logo as PNG bytes, fetched once from this app's own origin. */
let logoBytes: Promise<ArrayBuffer> | null = null;
export const loadLogo = () => {
  logoBytes ??= fetch(brand.logo).then((r) => {
    if (!r.ok) throw new Error("Couldn't load the FC logo.");
    return r.arrayBuffer();
  });
  return logoBytes;
};
