# mask-brush

Paint an inpainting mask on top of an image, right in the browser. Zero dependencies, about 150 lines, works with mouse, touch and pen.

It is the brush from [Swift Remover](https://swiftremover.com), a free tool to [remove a person from a photo](https://swiftremover.com/remove-person-from-photo/) online. We pulled it out so you can use it in your own image editing projects.

## What it does
- Paint with a round brush on a canvas laid over your image; the brush feels the same size at any zoom
- Undo and clear
- Export a **black-and-white mask** (white = remove), the format inpainting models expect: LaMa, Stable Diffusion inpainting, FLUX Fill and others
- Optionally grow the mask by a couple of pixels so edges are fully covered (this matters a lot for clean results)
- Export the **photo with the paint on top**, useful when a vision model needs to see what the user painted
- Pointer Events with `touch-action: none`, so painting with a finger on a phone does not scroll the page

## Use it
```html
<div style="position:relative">
  <canvas id="img"></canvas>
  <canvas id="mask" style="position:absolute; inset:0; width:100%; height:100%"></canvas>
</div>
<script type="module">
  import { createMaskBrush } from "./mask-brush.js";

  // size both canvases to the image (in pixels) first
  const brush = createMaskBrush(document.getElementById("mask"), {
    size: 34,
    onChange: ({ hasPaint, canUndo }) => { /* enable or disable your buttons */ },
  });

  const maskPng = await brush.toMaskBlob({ grow: 2 });          // send this to your inpainting model
  const overlayJpg = await brush.toOverlayBlob(imageCanvas);      // photo + paint, for a vision model
</script>
```
Open `index.html` for a working demo (it needs to be served over http, e.g. `npx serve`).

## API
| Method | |
|---|---|
| `createMaskBrush(canvas, { size, color, maxHistory, onChange })` | Turn a canvas into a brush |
| `setSize(n)` | Brush diameter in CSS pixels |
| `setEnabled(bool)` | Stop painting while a request runs |
| `undo()` / `clear(resetHistory)` | Undo the last stroke / clear the mask |
| `hasPaint`, `canUndo` | Current state |
| `toMaskBlob({ grow })` | PNG mask, white = painted |
| `toOverlayBlob(image, quality)` | JPEG of the image with the paint on top |
| `destroy()` | Remove event listeners |

## Tips from running it in production
- **Grow the mask a little.** Users rarely paint the outline exactly; 2 to 3 pixels of growth removes the faint halo that is left otherwise.
- **Resize big photos before painting** (we use 1024px on the long side). The mask and the image must have the same pixel size.
- **Simple inpainting models** (like LaMa) fill from nearby pixels: great on sky and sand, smeary on busy rooms. **Instruction-based editors** look more natural on busy scenes but do not read masks, so send them the overlay image plus a short description of what is painted.

## License
MIT
