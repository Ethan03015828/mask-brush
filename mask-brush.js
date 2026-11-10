// mask-brush: paint an inpainting mask on top of an image in the browser.
// Zero dependencies. Works with mouse, touch and pen (Pointer Events).
// MIT License. Extracted from Swift Remover (https://swiftremover.com).

/**
 * Turn a <canvas> into a brush for painting a mask.
 *
 * The canvas is sized to the image in pixels; CSS can scale it however you like
 * (pointer positions are mapped back to image pixels, so the mask always lines
 * up with the photo).
 *
 * @param {HTMLCanvasElement} canvas  overlay canvas, same pixel size as the image
 * @param {object} [opts]
 * @param {number} [opts.size=34]          brush diameter in CSS pixels
 * @param {string} [opts.color]            paint color shown to the user
 * @param {number} [opts.maxHistory=20]    undo steps kept
 * @param {(state: {hasPaint: boolean, canUndo: boolean}) => void} [opts.onChange]
 */
export function createMaskBrush(canvas, opts = {}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let size = opts.size ?? 34;
  const color = opts.color ?? "rgba(255, 64, 64, 0.55)";
  const maxHistory = opts.maxHistory ?? 20;
  const onChange = opts.onChange ?? (() => {});
  let history = [];
  let painting = false, last = null, hasPaint = false, enabled = true;

  const notify = () => onChange({ hasPaint, canUndo: history.length > 0 });

  // brush size in image pixels, so it feels the same at any zoom level
  const pxSize = () => size * (canvas.width / canvas.getBoundingClientRect().width || 1);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
  }

  function stroke(a, b) {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = pxSize();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function onDown(e) {
    if (!enabled) return;
    canvas.setPointerCapture(e.pointerId);
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (history.length > maxHistory) history.shift();
    painting = true;
    last = pos(e);
    stroke(last, last);
    hasPaint = true;
    notify();
  }
  function onMove(e) {
    if (!painting) return;
    const p = pos(e);
    stroke(last, p);
    last = p;
  }
  function onUp() { painting = false; }

  canvas.style.touchAction = "none"; // let the finger paint instead of scrolling
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return {
    /** Brush diameter in CSS pixels. */
    setSize(n) { size = n; },
    /** Stop or allow painting (e.g. while a request is running). */
    setEnabled(v) { enabled = !!v; },
    get hasPaint() { return hasPaint; },
    get canUndo() { return history.length > 0; },

    undo() {
      const snap = history.pop();
      if (!snap) return;
      ctx.putImageData(snap, 0, 0);
      hasPaint = snap.data.some((v, i) => i % 4 === 3 && v > 0);
      notify();
    },

    /** Clear the mask. Pass true to also forget the undo history (e.g. new image). */
    clear(resetHistory = false) {
      if (!resetHistory && hasPaint) history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (resetHistory) history = [];
      hasPaint = false;
      notify();
    },

    /**
     * Export a black-and-white mask: white = painted (remove), black = keep.
     * This is the format most inpainting models expect (LaMa, Stable Diffusion
     * inpainting, FLUX Fill, ...).
     * @param {object} [o]
     * @param {number} [o.grow=2]  grow the painted area by about this many pixels so edges are covered
     * @returns {Promise<Blob>} PNG
     */
    toMaskBlob({ grow = 2 } = {}) {
      const w = canvas.width, h = canvas.height;
      const src = ctx.getImageData(0, 0, w, h);
      const bin = document.createElement("canvas");
      bin.width = w; bin.height = h;
      const bctx = bin.getContext("2d");
      const out = bctx.createImageData(w, h);
      for (let i = 0; i < src.data.length; i += 4) {
        const v = src.data[i + 3] > 10 ? 255 : 0;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
        out.data[i + 3] = 255;
      }
      bctx.putImageData(out, 0, 0);
      const g = document.createElement("canvas");
      g.width = w; g.height = h;
      const gctx = g.getContext("2d", { willReadFrequently: true });
      gctx.fillStyle = "#000";
      gctx.fillRect(0, 0, w, h);
      if (grow > 0) gctx.filter = `blur(${grow}px)`;
      gctx.drawImage(bin, 0, 0);
      gctx.filter = "none";
      if (grow > 0) {
        const d = gctx.getImageData(0, 0, w, h);
        for (let j = 0; j < d.data.length; j += 4) {
          const on = d.data[j] > 40 ? 255 : 0;
          d.data[j] = d.data[j + 1] = d.data[j + 2] = on;
          d.data[j + 3] = 255;
        }
        gctx.putImageData(d, 0, 0);
      }
      return new Promise((res) => g.toBlob(res, "image/png"));
    },

    /**
     * Export the photo with the paint on top, as the user sees it.
     * Useful for vision models ("what is under the red paint?").
     * @param {CanvasImageSource} image  the photo, same pixel size as the canvas
     * @returns {Promise<Blob>} JPEG
     */
    toOverlayBlob(image, quality = 0.9) {
      const c = document.createElement("canvas");
      c.width = canvas.width; c.height = canvas.height;
      const cctx = c.getContext("2d");
      cctx.drawImage(image, 0, 0, c.width, c.height);
      cctx.drawImage(canvas, 0, 0);
      return new Promise((res) => c.toBlob(res, "image/jpeg", quality));
    },

    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    },
  };
}
