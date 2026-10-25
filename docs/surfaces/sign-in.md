# Sign-in surface · Operate

Audience: FC staff and temporary Railway pilot testers. Keep the form on this page; real staff authentication remains email-code based. Retain FC artwork and Public Sans. The supplied photography-led references set the layout direction; no new product-wide visual identity is introduced.

## Direction contract

THESIS: A calm entry to document work, connecting Ghanaian forestry with an understandable paper-to-PDF workflow.

OWN-WORLD: Existing FC green and Public Sans on a warm paper surface. Photography in one framed composition; forms stay flat, legible and labelled. Existing dark theme remains supported.

STORY: Recognize the organization, distinguish public pilot access from staff sign-in, enter the tools. Demo credentials are visibly public and never create a backend session.

FIRST VIEWPORT: FC logo at top left; large two-line promise and Kakum photograph at left; stable email/code form at right. On phones the introduction leads directly into the form, with imagery below it.

FORM: Direct adaptation of the owner's two visual references within the established FC identity. No concept seed: the owner pinned the reference direction and same-page form. One paper-preview settle animation; reduced motion removes it.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

The existing site system is preserved. This local surface contract records the warm paper variation; it does not rewrite the site-wide palette.

## Finish verdict

Independent finish review: **ship**, with no material findings in the local
implementation and six supplied light/dark, desktop/mobile captures. Review
covered 320px and 390px phones, 1440px desktop and the actual 1579px browser.
The normal build still exposes only staff sign-in; the pilot build enables
explicit public demo access. Railway hosting and physical-phone tests remain
outside this local review.

Documentation scope follows the ordinary-extension rule: the existing visual
system remains authoritative in `client/src/index.css` and the existing FC
assets. No new global world or site-wide token change was introduced, so the
FINISH template's DESIGN.md clause is discharged through the implemented
surface documentation below rather than replacing global design authority.

## Implemented surface evidence

This is a local adaptation of the existing FC identity. The evidence below records the implementation; finish review remains pending and does not imply independent approval or deployment.

- **Color:** light mode uses warm paper (`#f5f3eb`), forest ink (`#183d2a`), muted text (`#536054`), dividers (`#d6d9cb`) and fields (`#fffef9`). Dark mode uses `#142119`, `#edf2e6`, `#b8c4b5`, `#485b48` and `#1d2e22` respectively. The primary action is `#244d31` in light mode and `#34783f` in dark mode. These are sign-in surface values, not replacements for global FC tokens.
- **Type and form:** Public Sans is self-hosted through `@fontsource-variable/public-sans`. Shared interaction rules supply at least 44px controls; this form uses 50px fields and primary action, with 16px field text. Labels remain visible, field errors are associated with their inputs, and the page provides a skip link and visible keyboard focus.
- **Responsive composition:** the desktop introduction and Kakum photograph sit beside a flat form (maximum width 420px). At widths up to and including 900px the grid becomes one column, ordered introduction, form, imagery, so the photograph does not delay mobile entry.
- **Motion:** the illustrative paper preview settles once over 0.8 seconds. Reduced-motion preference removes this animation and the primary action transition; shared rules also stop the loading spinner animation.
- **Public demo:** `VITE_DEMO_MODE` is opt-in and defaults to false. With it enabled, the page offers visibly public `demo@pdfdock.test` / `246810` details and a fill action. Keep `VITE_AUTH_REQUIRED=true` to expose the entry gate. Demo access uses a separate tab-scoped `sessionStorage` marker and demo identity; it does not create a verified staff profile or backend authentication session. Staff sign-in retains the official email/code flow. Server PDF-to-Word is disabled in demo mode.
- **Photography:** the Kakum image is credited in the footer to [ZSM on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kakum_National_Park,_Ghana.jpg), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), with cropping disclosed. Retain the credit and licence when shipping this raster.

Sources: `client/src/pages/Auth.tsx`, `client/src/pages/Auth.css`, `client/src/index.css`, `client/src/brand.ts`, `client/src/lib/demoAccess.ts` and `client/src/context/Auth.tsx`.

## PDF-to-Word pilot extension

A later, explicitly enabled Railway pilot can expose PDF-to-Word through a
private converter and same-origin server-key proxy. Set VITE_PDF2WORD_ENABLED=true
to show it in a demo build; the separate runtime PDF2WORD_PUBLIC_PILOT switch
remains default-off. Demo identity still creates no staff authentication cookie
or access to the internal head-office deployment. Pilot upload notices name
Railway and request sample documents. See docs/deployment/railway-pilot.md.
