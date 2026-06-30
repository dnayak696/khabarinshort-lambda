const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const newsFooter = ({
  WIDTH,
  HEIGHT,
  bottomSectionHeight,
  downloadBase64,
  logoNewBase64,
}) => `
  <defs>
    <linearGradient id="newsFooterBottomGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1F2937"/>
      <stop offset="50%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <clipPath id="newsFooterClip">
      <circle cx="120" cy="${HEIGHT - bottomSectionHeight + bottomSectionHeight / 2}" r="45" />
    </clipPath>
  </defs>
  <rect x="0" y="${HEIGHT - bottomSectionHeight}" width="${WIDTH}" height="${bottomSectionHeight}" fill="url(#newsFooterBottomGrad)" />
  <rect x="40" y="${HEIGHT - bottomSectionHeight + 25}" width="${WIDTH - 80}" height="${bottomSectionHeight - 50}" rx="32" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
  <circle cx="80" cy="${HEIGHT - bottomSectionHeight + 80}" r="120" fill="rgba(253,224,71,0.05)" />
  <circle cx="120" cy="${HEIGHT - bottomSectionHeight + bottomSectionHeight / 2}" r="45" fill="rgba(255,255,255,0.15)" />
  ${logoNewBase64 ? `<image x="70" y="${HEIGHT - bottomSectionHeight + bottomSectionHeight / 2 - 50}" width="100" height="100" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${logoNewBase64}" clip-path="url(#newsFooterClip)"/>` : ""}
  <text x="210" y="${HEIGHT - bottomSectionHeight + 90}" fill="#FFFFFF" font-size="30" font-family="Arial" font-weight="900">KHABAR IN SHORT</text>
  <text x="210" y="${HEIGHT - bottomSectionHeight + 125}" fill="#CBD5E1" font-size="18" font-family="Arial">Odisha's Trusted News App</text>
  <rect x="${WIDTH - 320}" y="${HEIGHT - bottomSectionHeight + 50}" width="250" height="90" rx="25" fill="rgba(255,255,255,0.10)" />
  ${downloadBase64 ? `<image x="${WIDTH - 300}" y="${HEIGHT - bottomSectionHeight + 60}" width="210" height="70" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${downloadBase64}"/>` : ""}
`;

const templateHeader = ({ WIDTH, title }) => `
  <rect x="0" y="0" width="${WIDTH}" height="160" fill="rgba(15,23,42,0.96)" />
  <text x="${WIDTH / 2}" y="100" fill="#FDE047" font-size="42" font-family="Arial" font-weight="900" text-anchor="middle">${escapeXML(title || "NEWS CARD SORT")}</text>
`;

const templates = [
  {
    name: "Bold Gradient",
    svg: ({
      WIDTH,
      HEIGHT,
      IMAGE_HEIGHT,
      title,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title })}
        <defs>
          <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#fff"/>
            <stop offset="100%" stop-color="#FBBF24"/>
          </linearGradient>
        </defs>
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#1D4ED8" />
        <circle cx="320" cy="${IMAGE_HEIGHT + 120}" r="220" fill="rgba(255,255,255,0.05)" />
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="rgba(0,0,0,0.3)" />
        <text x="60" y="${IMAGE_HEIGHT + 50}" fill="#F8FAFC" font-size="24" font-family="Arial" font-weight="700">LATEST UPDATE</text>
        <text x="60" y="${IMAGE_HEIGHT + 130}" fill="url(#textGrad)" font-size="52" font-family="Arial" font-weight="800">
          ${lines.map((line, i) => `<tspan x="60" dy="${i === 0 ? 0 : 60}">${escapeXML(line)}</tspan>`).join("")}
        </text>
        <rect x="60" y="${IMAGE_HEIGHT + 340}" width="220" height="50" rx="25" fill="#F59E0B" />
        <text x="170" y="${IMAGE_HEIGHT + 375}" fill="#111827" font-size="24" font-family="Arial" font-weight="700" text-anchor="middle">TRENDING</text>
        ${newsFooter({ WIDTH, HEIGHT, bottomSectionHeight, downloadBase64, logoNewBase64 })}
      </svg>
      `;
    },
  },
  {
    name: "News Sort",
    svg: ({
      WIDTH,
      HEIGHT,
      IMAGE_HEIGHT,
      lines,
      title,
      description,
      downloadBase64,
      logoNewBase64,
    }) => {
      const titleBandHeight = 160;
      const titleY = 100;
      const bottomBandTop = IMAGE_HEIGHT;
      const bodyY = IMAGE_HEIGHT + 60;
      const bottomSectionHeight = 180;
      const logoY = HEIGHT - bottomSectionHeight + 20;
      const logoNewX = WIDTH / 2 - 180;
      const downloadLogoX = WIDTH / 2 + 80;
      const appNameY = HEIGHT - 20;

      const paletteOptions = [
        {
          sortFrom: "#0EA5E9",
          sortTo: "#2563EB",
          textStops: ["#FF6B6B", "#FFA500", "#FFD700", "#00D4FF", "#00FF88"],
          bottomFrom: "#1F2937",
          bottomMid: "#0F172A",
          bottomTo: "#111827",
        },
        {
          sortFrom: "#F59E0B",
          sortTo: "#EF4444",
          textStops: ["#FFF7ED", "#FBBF24", "#F97316", "#EF4444", "#EC4899"],
          bottomFrom: "#161618",
          bottomMid: "#292D3C",
          bottomTo: "#111827",
        },
        {
          sortFrom: "#22C55E",
          sortTo: "#14B8A6",
          textStops: ["#D9F99D", "#86EFAC", "#22C55E", "#14B8A6", "#0F766E"],
          bottomFrom: "#111827",
          bottomMid: "#0F172A",
          bottomTo: "#111827",
        },
        {
          sortFrom: "#8B5CF6",
          sortTo: "#EC4899",
          textStops: ["#EDE9FE", "#C4B5FD", "#A78BFA", "#E879F9", "#F472B6"],
          bottomFrom: "#131A2D",
          bottomMid: "#1E293B",
          bottomTo: "#111827",
        },
      ];
      const palette =
        paletteOptions[Math.floor(Math.random() * paletteOptions.length)];

      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        <defs>
          <linearGradient id="sortGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${palette.sortFrom}"/>
            <stop offset="100%" stop-color="${palette.sortTo}"/>
          </linearGradient>
          <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${palette.textStops[0]}"/>
            <stop offset="25%" stop-color="${palette.textStops[1]}"/>
            <stop offset="50%" stop-color="${palette.textStops[2]}"/>
            <stop offset="75%" stop-color="${palette.textStops[3]}"/>
            <stop offset="100%" stop-color="${palette.textStops[4]}"/>
          </linearGradient>
          <linearGradient id="bottomGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${palette.bottomFrom}"/>
            <stop offset="50%" stop-color="${palette.bottomMid}"/>
            <stop offset="100%" stop-color="${palette.bottomTo}"/>
          </linearGradient>
          <clipPath id="circleClip">
            <circle cx="120" cy="${HEIGHT - bottomSectionHeight + bottomSectionHeight / 2}" r="45" />
          </clipPath>
        </defs>
        <rect x="0" y="0" width="${WIDTH}" height="${titleBandHeight}" fill="rgba(15,23,42,0.96)" />
        <text x="${WIDTH / 2}" y="${titleY}" fill="#FDE047" font-size="42" font-family="Arial" font-weight="900" text-anchor="middle">${escapeXML(title || "NEWS CARD SORT")}</text>
        <rect x="0" y="${bottomBandTop}" width="${WIDTH}" height="${HEIGHT - bottomBandTop}" fill="#0F172A" />
        <rect x="0" y="${bottomBandTop + 30}" width="${WIDTH}" height="320" rx="40" fill="#111827" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
        <text x="${WIDTH / 2}" y="${bodyY}" fill="url(#textGrad)" font-size="48" font-family="Arial" font-weight="900" text-anchor="middle">
          ${lines.map((line, i) => `<tspan x="${WIDTH / 2}" dy="${i === 0 ? 0 : 58}">${escapeXML(line)}</tspan>`).join("")}
        </text>
       <!-- Footer background -->
<rect
  x="0"
  y="${HEIGHT - bottomSectionHeight}"
  width="${WIDTH}"
  height="${bottomSectionHeight}"
  fill="url(#bottomGrad)"
/>

<!-- Glass card -->
<rect
  x="40"
  y="${HEIGHT - bottomSectionHeight + 25}"
  width="${WIDTH - 80}"
  height="${bottomSectionHeight - 50}"
  rx="32"
  fill="rgba(255,255,255,0.08)"
  stroke="rgba(255,255,255,0.12)"
  stroke-width="2"
/>

<!-- Left glow -->
<circle
  cx="80"
  cy="${HEIGHT - bottomSectionHeight + 80}"
  r="120"
  fill="rgba(253,224,71,0.05)"
/>

<!-- Logo -->
<circle
  cx="120"
  cy="${HEIGHT - bottomSectionHeight + bottomSectionHeight / 2}"
  r="45"
  fill="rgba(255,255,255,0.15)"
/>

${
  logoNewBase64
    ? `
<image
  x="70"
  y="${HEIGHT - bottomSectionHeight + bottomSectionHeight / 2 - 50}"
  width="100"
  height="100"
  preserveAspectRatio="xMidYMid slice"
  href="data:image/png;base64,${logoNewBase64}"
  clip-path="url(#circleClip)"
/>`
    : ""
}

<!-- App name -->
<text
  x="210"
  y="${HEIGHT - bottomSectionHeight + 90}"
  fill="#FFFFFF"
  font-size="30"
  font-family="Arial"
  font-weight="900">
  KHABAR IN SHORT
</text>

<text
  x="210"
  y="${HEIGHT - bottomSectionHeight + 125}"
  fill="#CBD5E1"
  font-size="18"
  font-family="Arial">
  Odisha's Trusted News App
</text>

<!-- Play Store container -->
<rect
  x="${WIDTH - 320}"
  y="${HEIGHT - bottomSectionHeight + 50}"
  width="250"
  height="90"
  rx="25"
  fill="rgba(255,255,255,0.10)"
/>

${
  downloadBase64
    ? `
<image
  x="${WIDTH - 300}"
  y="${HEIGHT - bottomSectionHeight + 60}"
  width="210"
  height="70"
  href="data:image/png;base64,${downloadBase64}"
/>`
    : ""
}
</svg>`;
    },
  },
  {
    name: "Soft Neon",
    svg: ({
      WIDTH,
      HEIGHT,
      IMAGE_HEIGHT,
      title,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title })}
        <defs>
          <radialGradient id="halo" cx="50%" cy="30%" r="50%">
            <stop offset="0%" stop-color="rgba(59,130,246,0.5)"/>
            <stop offset="100%" stop-color="transparent"/>
          </radialGradient>
        </defs>
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#020617" />
        <rect x="40" y="${IMAGE_HEIGHT + 30}" width="1000" height="280" rx="40" fill="rgba(15,23,42,0.92)" />
        <circle cx="900" cy="${IMAGE_HEIGHT + 100}" r="180" fill="url(#halo)" />
        <text x="80" y="${IMAGE_HEIGHT + 70}" fill="#38BDF8" font-size="28" font-family="Arial" font-weight="700">NEW FLASH</text>
        <text x="80" y="${IMAGE_HEIGHT + 130}" fill="#F8FAFC" font-size="48" font-family="Arial" font-weight="800">
          ${lines.map((line, i) => `<tspan x="80" dy="${i === 0 ? 0 : 58}">${escapeXML(line)}</tspan>`).join("")}
        </text>
        <line x1="80" y1="${IMAGE_HEIGHT + 280}" x2="420" y2="${IMAGE_HEIGHT + 280}" stroke="#38BDF8" stroke-width="6" />
        ${newsFooter({ WIDTH, HEIGHT, bottomSectionHeight, downloadBase64, logoNewBase64 })}
      </svg>
      `;
    },
  },
  {
    name: "Dark Glass",
    svg: ({
      WIDTH,
      HEIGHT,
      IMAGE_HEIGHT,
      title,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title })}
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#111827" />
        <rect x="60" y="${IMAGE_HEIGHT + 30}" width="960" height="280" rx="40" fill="rgba(15,23,42,0.88)" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
        <rect x="640" y="${IMAGE_HEIGHT + 50}" width="320" height="80" rx="30" fill="#2563EB" />
        <text x="670" y="${IMAGE_HEIGHT + 90}" fill="#fff" font-size="24" font-family="Arial" font-weight="700">BREAKING</text>
        <text x="90" y="${IMAGE_HEIGHT + 90}" fill="#E2E8F0" font-size="24" font-family="Arial" font-weight="700">TODAY</text>
        <text x="90" y="${IMAGE_HEIGHT + 150}" fill="#FFFFFF" font-size="48" font-family="Arial" font-weight="800">
          ${lines.map((line, i) => `<tspan x="90" dy="${i === 0 ? 0 : 58}">${escapeXML(line)}</tspan>`).join("")}
        </text>
        <rect x="90" y="${IMAGE_HEIGHT + 330}" width="260" height="45" rx="23" fill="#22C55E" />
        <text x="220" y="${IMAGE_HEIGHT + 358}" fill="#fff" font-size="20" font-family="Arial" font-weight="700" text-anchor="middle">INSIDE STORY</text>
        ${newsFooter({ WIDTH, HEIGHT, bottomSectionHeight, downloadBase64, logoNewBase64 })}
      </svg>
      `;
    },
  },
  {
    name: "Color Blocks",
    svg: ({
      WIDTH,
      HEIGHT,
      IMAGE_HEIGHT,
      title,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title })}
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="80" fill="#F97316" />
        <rect x="0" y="${IMAGE_HEIGHT + 80}" width="${WIDTH}" height="80" fill="#0891B2" />
        <rect x="0" y="${IMAGE_HEIGHT + 160}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT - 160}" fill="#0EA5E9" />
        <text x="60" y="${IMAGE_HEIGHT + 50}" fill="#fff" font-size="26" font-family="Arial" font-weight="700">SPOTLIGHT</text>
        <text x="60" y="${IMAGE_HEIGHT + 130}" fill="#fff" font-size="26" font-family="Arial" font-weight="700">LATEST HEADLINES</text>
        <text x="60" y="${IMAGE_HEIGHT + 210}" fill="#0F172A" font-size="48" font-family="Arial" font-weight="800">
          ${lines.map((line, i) => `<tspan x="60" dy="${i === 0 ? 0 : 60}">${escapeXML(line)}</tspan>`).join("")}
        </text>
        <circle cx="980" cy="${IMAGE_HEIGHT + 100}" r="70" fill="#F8FAFC" opacity="0.18" />
        ${newsFooter({ WIDTH, HEIGHT, bottomSectionHeight, downloadBase64, logoNewBase64 })}
      </svg>
      `;
    },
  },
  {
    name: "Minimal Frame",
    svg: ({
      WIDTH,
      HEIGHT,
      IMAGE_HEIGHT,
      title,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title })}
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#F8FAFC" />
        <rect x="40" y="${IMAGE_HEIGHT + 20}" width="1000" height="300" rx="40" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
        <rect x="60" y="${IMAGE_HEIGHT + 30}" width="240" height="50" rx="30" fill="#8B5CF6" />
        <text x="180" y="${IMAGE_HEIGHT + 65}" fill="#fff" font-size="24" font-family="Arial" font-weight="700" text-anchor="middle">TOP STORY</text>
        <text x="60" y="${IMAGE_HEIGHT + 120}" fill="#111827" font-size="48" font-family="Arial" font-weight="800">
          ${lines.map((line, i) => `<tspan x="60" dy="${i === 0 ? 0 : 58}">${escapeXML(line)}</tspan>`).join("")}
        </text>
        <line x1="60" y1="${IMAGE_HEIGHT + 280}" x2="380" y2="${IMAGE_HEIGHT + 280}" stroke="#A855F7" stroke-width="8" />
        ${newsFooter({ WIDTH, HEIGHT, bottomSectionHeight, downloadBase64, logoNewBase64 })}
      </svg>
      `;
    },
  },
];

function pickRandomTemplate({ title, description }) {
  if (title || description) {
    return (
      templates.find((template) => template.name === "News Sort") ||
      templates[0]
    );
  }

  return templates[Math.floor(Math.random() * templates.length)];
}

async function generateMobilePost({
  imageUrl,
  title = "",
  text,
  description = "",
  outputPath = "./mobile-post.jpg",
  templateName,
}) {
  const WIDTH = 1080;
  const HEIGHT = 1350;
  const IMAGE_HEIGHT = 850;

  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
  });

  const imageBuffer = Buffer.from(response.data);
  const lines = wrapText(text, 40);

  // Load logos
  let downloadBase64 = "";
  let logoNewBase64 = "";
  try {
    const downloadBuffer = fs.readFileSync("./assets/google_paly_download.png");
    downloadBase64 = downloadBuffer.toString("base64");
  } catch (err) {
    console.warn("Download button not found");
  }
  try {
    const logoNewBuffer = fs.readFileSync("./assets/logo_new.png");
    logoNewBase64 = logoNewBuffer.toString("base64");
  } catch (err) {
    console.warn("Logo new not found");
  }

  const template = templateName
    ? templates.find((template) => template.name === templateName) ||
      pickRandomTemplate({ title, description })
    : pickRandomTemplate({ title, description });
  const svg = template.svg({
    WIDTH,
    HEIGHT,
    IMAGE_HEIGHT,
    lines,
    title,
    description,
    downloadBase64,
    logoNewBase64,
  });

  const templateFileName = `${slugify(template.name)}.jpg`;
  const resolvedOutputPath =
    outputPath.endsWith(path.sep) || path.extname(outputPath) === ""
      ? path.join(outputPath, templateFileName)
      : path.basename(outputPath) === path.basename("./mobile-post.jpg") &&
          templateName
        ? path.join(path.dirname(outputPath), templateFileName)
        : outputPath;

  console.log("Selected template:", template.name);
  console.log("Output file:", resolvedOutputPath);

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([
      {
        input: await sharp(imageBuffer)
          .resize(WIDTH, IMAGE_HEIGHT, {
            fit: "contain",
            background: "#111827",
            position: "centre",
          })
          .toBuffer(),
        top: 0,
        left: 0,
      },
      {
        input: Buffer.from(svg),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({
      quality: 90,
    })
    .toFile(resolvedOutputPath);

  return resolvedOutputPath;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function generateAllMobilePosts({
  imageUrl,
  title = "",
  text,
  description = "",
  outputDir = "./",
}) {
  fs.mkdirSync(outputDir, { recursive: true });

  for (const template of templates) {
    const fileName = `${slugify(template.name)}.jpg`;
    const outputPath = path.join(outputDir, fileName);
    await generateMobilePost({
      imageUrl,
      title,
      text,
      description,
      outputPath,
      templateName: template.name,
    });
  }
}

function wrapText(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    if ((line + word).length > maxChars) {
      lines.push(line.trim());
      line = word + " ";
    } else {
      line += word + " ";
    }
  }

  if (line.trim()) {
    lines.push(line.trim());
  }

  return lines.slice(0, 4);
}

function escapeXML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = {
  generateMobilePost,
  generateAllMobilePosts,
};

// Example
// (async () => {
//   await generateAllMobilePosts({
//     imageUrl:
//       "https://www.dharitri.com/wp-content/uploads/2026/06/22-6-1568x882.jpg",
//     title: "ଏଟିଏମ୍‌ ଅଚଳ, ୧୫ ଦିନ ହେଲା ଗ୍ରାହକ ହନ୍ତସନ୍ତ",
//     text: "କନ୍ଧମାଳ ଜିଲା ଦାରିଙ୍ଗବାଡ଼ି ବ୍ଲକର ପ୍ରମୁଖ ବଜାର ସିମନବାଡ଼ି ଛକରେ ଥିବା ୧ ମାତ୍ର ଏଟିଏମ୍‌ ଅଚଳ ହୋଇପଡ଼ିଛି।",
//     description: "A bold new report from the scene with key details below",
//     outputDir: "./output",
//   });

//   console.log("All mobile posts generated");
// })();
