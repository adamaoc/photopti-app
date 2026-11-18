const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PALETTES = [
  { sky: ["#0b1d3a", "#f28c38"], sun: "#ffd27a", hills: ["#3b2a4d", "#24172f", "#140c1c"] },
  { sky: ["#7fc8f8", "#e6f4ff"], sun: "#fff6d5", hills: ["#5f9e6e", "#3f7a52", "#24533a"] },
  { sky: ["#2b1055", "#d53369"], sun: "#ffcf70", hills: ["#4a1b5e", "#2f0f40", "#1a0726"] },
  { sky: ["#89f7fe", "#66a6ff"], sun: "#ffffff", hills: ["#c9d6df", "#8fa3b5", "#52667a"] },
  { sky: ["#f6d365", "#fda085"], sun: "#fff3c4", hills: ["#b55d4c", "#8a3f35", "#5c2722"] },
  { sky: ["#0f2027", "#2c5364"], sun: "#e0f7ff", hills: ["#1b3a44", "#12272e", "#0a171b"] },
];

function createRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function ridge(random, width, height, baseline, roughness) {
  const points = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = baseline - random() * roughness;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M0,${height} L${points.join(" L")} L${width},${height} Z`;
}

function sceneSvg(index, width, height) {
  const random = createRandom(index * 7919 + 17);
  const palette = PALETTES[index % PALETTES.length];
  const sunX = width * (0.2 + random() * 0.6);
  const sunY = height * (0.2 + random() * 0.25);
  const sunR = Math.min(width, height) * (0.06 + random() * 0.05);
  const hills = palette.hills
    .map((color, layer) => {
      const baseline = height * (0.55 + layer * 0.13);
      return `<path d="${ridge(random, width, height, baseline, height * (0.22 - layer * 0.05))}" fill="${color}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.sky[0]}"/>
      <stop offset="1" stop-color="${palette.sky[1]}"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${index}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#sky)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="${palette.sun}" opacity="0.92"/>
  ${hills}
  <rect width="100%" height="100%" filter="url(#grain)"/>
</svg>`;
}

async function writeScene(filePath, index, { width = 2400, height = 1600 } = {}) {
  await sharp(Buffer.from(sceneSvg(index, width, height)))
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toFile(filePath);
  return filePath;
}

/** A portrait photo stored the way phones do: landscape pixels plus an EXIF rotation tag. */
async function writeRotatedPhonePhoto(filePath, index) {
  const upright = await sharp(Buffer.from(sceneSvg(index, 1200, 1800))).png().toBuffer();
  await sharp(upright)
    .rotate(-90)
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toFile(filePath);
  return filePath;
}

async function writeTransparentLogo(filePath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <circle cx="600" cy="600" r="420" fill="#5a8eca"/>
    <circle cx="600" cy="600" r="240" fill="none" stroke="#f5c542" stroke-width="60"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filePath);
  return filePath;
}

async function createFixtureLibrary(root, { count = 18 } = {}) {
  const album = path.join(root, "Coastline shoot");
  const subfolder = path.join(album, "Day 2");
  await fs.promises.mkdir(subfolder, { recursive: true });

  for (let i = 0; i < count; i++) {
    const folder = i % 3 === 2 ? subfolder : album;
    await writeScene(path.join(folder, `DSC_${String(1000 + i)}.jpg`), i);
  }
  await writeRotatedPhonePhoto(path.join(album, "IMG_0420 (phone).jpg"), 3);
  await writeTransparentLogo(path.join(album, "studio-logo.png"));
  await fs.promises.writeFile(path.join(album, "corrupted-upload.jpg"), "this is not an image");
  // macOS AppleDouble sidecar: must be ignored entirely.
  await fs.promises.writeFile(path.join(album, "._DSC_1000.jpg"), "sidecar");

  return { album, subfolder };
}

module.exports = {
  createFixtureLibrary,
  writeRotatedPhonePhoto,
  writeScene,
};
