/** Rasterize SVG (e.g. Mermaid) to PNG for help PDF export. */

export type RasterizedDiagram = {
  dataUrl: string;
  width: number;
  height: number;
};

const RASTER_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

function prepareSvgClone(svg: SVGElement): { clone: SVGElement; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  let width = 0;
  let height = 0;

  try {
    if (svg instanceof SVGGraphicsElement) {
      const bbox = svg.getBBox();
      if (bbox.width > 0 && bbox.height > 0) {
        clone.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
        width = bbox.width;
        height = bbox.height;
      }
    }
  } catch {
    // getBBox can fail if SVG is not laid out yet
  }

  if (!width || !height) {
    const viewBox = clone.getAttribute("viewBox")?.split(/\s+/).map(Number);
    const rect = svg.getBoundingClientRect();
    width =
      viewBox && viewBox.length >= 4
        ? viewBox[2]!
        : rect.width || Number(clone.getAttribute("width")) || 800;
    height =
      viewBox && viewBox.length >= 4
        ? viewBox[3]!
        : rect.height || Number(clone.getAttribute("height")) || 600;
  }

  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.background = "#ffffff";

  return { clone, width, height };
}

async function svgElementToPngInner(svg: SVGElement): Promise<RasterizedDiagram | null> {
  const { clone, width, height } = prepareSvgClone(svg);
  const svgString = new XMLSerializer().serializeToString(clone);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function rasterizeSvgElement(svg: SVGElement): Promise<RasterizedDiagram | null> {
  try {
    return await withTimeout(svgElementToPngInner(svg), RASTER_TIMEOUT_MS);
  } catch {
    return null;
  }
}

export async function rasterizeDiagramContainer(
  container: HTMLElement,
): Promise<RasterizedDiagram | null> {
  const svg = container.querySelector("svg");
  if (!(svg instanceof SVGElement)) return null;
  return rasterizeSvgElement(svg);
}
