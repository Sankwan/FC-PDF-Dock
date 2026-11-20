// iPhone/iPad Safari zooms in whenever a small text box is tapped, and the
// page then stays zoomed. maximum-scale stops that zoom; iOS still lets people
// pinch-zoom. On Android it would block pinch-zoom, so this is iOS only.
(function () {
  var ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var meta = document.querySelector('meta[name="viewport"]');
  if (ios && meta) meta.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover");
})();
