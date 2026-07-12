import "@testing-library/react";

// jsdom does not implement scrollIntoView; the DOM host calls it during reveal.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no-op in tests */
  };
}
