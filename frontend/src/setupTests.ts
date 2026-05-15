import { config } from "dotenv";
import { resolve } from "path";

// Load local `.env` into `process.env` so Jest can read optional vars (e.g. live login test creds).
config({ path: resolve(process.cwd(), ".env"), quiet: true });

import "@testing-library/jest-dom";

// Radix Select / cmdk use pointer capture + ResizeObserver; jsdom omits them by default.
global.ResizeObserver =
  global.ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

const proto = Element.prototype as Element & {
  hasPointerCapture?: (id: number) => boolean;
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
};
if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};

// Radix Select + cmdk call scrollIntoView on highlight; jsdom omits it.
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || jest.fn();
