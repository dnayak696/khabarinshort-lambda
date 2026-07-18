const path = require("path");
const fs = require("fs");

const ASSETS_DIR = path.join(__dirname, "../assets");
const FONT_DIR = path.join(ASSETS_DIR, "fonts");
const FONTCONFIG_FILE = path.join("/tmp", "khabar-fonts.conf");
const FONTCONFIG_CACHE_DIR = path.join("/tmp", "fontconfig-cache");
const ODIA_FONT_FAMILY = "Noto Sans Oriya";
const UI_FONT_FAMILY = `${ODIA_FONT_FAMILY}, 'Noto Sans', Arial, sans-serif`;
const ODIA_TEXT_PATTERN = /[\u0B00-\u0B7F]/;
const TITLE_MAX_CHARS = 22;
const TITLE_MAX_LINES = 3;
const TITLE_MAX_WIDTH = 900;
const ENGLISH_FONT_FAMILIES = {
  robotoBlack:
    "'Roboto Black', Roboto, 'Arial Black', Impact, 'Noto Sans', Arial, sans-serif",
  brand:
    "'Roboto Black', Roboto, 'Arial Black', Impact, 'Noto Sans', Arial, sans-serif",
  condensed:
    "Impact, 'Arial Narrow', 'Noto Sans Condensed', 'Noto Sans', Arial, sans-serif",
  editorial: "Georgia, 'Times New Roman', serif",
  modern: "'Avenir Next', Montserrat, 'Noto Sans', Arial, sans-serif",
  clean: "'Helvetica Neue', Helvetica, 'Noto Sans', Arial, sans-serif",
  slab: "Rockwell, Georgia, 'Noto Serif', serif",
};

configureFontConfig();

const sharp = require("sharp");
const axios = require("axios");

function configureFontConfig() {
  fs.mkdirSync(FONTCONFIG_CACHE_DIR, { recursive: true });

  const fontDirs = [
    FONT_DIR,
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    "/Library/Fonts",
  ].filter((fontDir) => fs.existsSync(fontDir));

  const fontDirsXml = fontDirs
    .map((fontDir) => `  <dir>${escapeXml(fontDir)}</dir>`)
    .join("\n");

  fs.writeFileSync(
    FONTCONFIG_FILE,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
${fontDirsXml}
  <cachedir>${escapeXml(FONTCONFIG_CACHE_DIR)}</cachedir>
</fontconfig>
`,
  );

  process.env.FONTCONFIG_FILE = FONTCONFIG_FILE;
  process.env.FONTCONFIG_PATH = "/tmp";
  process.env.XDG_CACHE_HOME = "/tmp";
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fontForText(value, englishFontFamily = ENGLISH_FONT_FAMILIES.modern) {
  return ODIA_TEXT_PATTERN.test(value || "")
    ? UI_FONT_FAMILY
    : englishFontFamily;
}

function getOptimizedFontSize(text, baseSize, minSize = 28) {
  const normalized = String(text || "").replace(/\s+/g, "");
  if (!normalized) return baseSize;
  if (normalized.length > 70) return Math.max(minSize, baseSize - 10);
  if (normalized.length > 46) return Math.max(minSize, baseSize - 6);
  if (normalized.length > 28) return Math.max(minSize, baseSize - 3);
  return baseSize;
}

function renderMultilineText({
  x,
  y,
  lines,
  fill,
  fontFamily,
  fontSize,
  fontWeight = 700,
  lineHeight = 56,
  anchor = "start",
}) {
  const normalizedLines = Array.isArray(lines) && lines.length ? lines : [""];
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `fill="${fill}"`,
    `font-size="${fontSize}"`,
    `font-family="${fontFamily}"`,
    `font-weight="${fontWeight}"`,
    anchor !== "start" ? `text-anchor="${anchor}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<text ${attrs}>${normalizedLines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}"${fitTextAttrs(line)}>${escapeXML(line || "")}</tspan>`;
    })
    .join("")}</text>`;
}

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
  <text x="210" y="${HEIGHT - bottomSectionHeight + 90}" fill="#FFFFFF" font-size="30" font-family="${ENGLISH_FONT_FAMILIES.brand}" font-weight="900">KHABAR IN SHORT</text>
  <text x="210" y="${HEIGHT - bottomSectionHeight + 125}" fill="#CBD5E1" font-size="18" font-family="${ENGLISH_FONT_FAMILIES.clean}" font-weight="500">Odisha's Trusted News App</text>
  <rect x="${WIDTH - 320}" y="${HEIGHT - bottomSectionHeight + 50}" width="250" height="90" rx="25" fill="rgba(255,255,255,0.10)" />
  ${downloadBase64 ? `<image x="${WIDTH - 300}" y="${HEIGHT - bottomSectionHeight + 60}" width="210" height="70" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${downloadBase64}"/>` : ""}
`;

const templateHeader = ({ WIDTH, title, titleLines }) => {
const headerFontSize = getOptimizedFontSize(title, 42, 30);
      const headerLineHeight = Math.max(36, Math.round(headerFontSize * 0.95));

  return `
    <rect x="0" y="0" width="${WIDTH}" height="180" fill="rgba(15,23,42,0.96)" />
    <text x="${WIDTH / 2}" y="96" fill="#FDE047" font-size="${headerFontSize}" font-family="${fontForText(title, ENGLISH_FONT_FAMILIES.brand)}" font-weight="900" text-anchor="middle">
      ${titleLines
        .map(
          (line, i) => `<tspan x="${WIDTH / 2}" dy="${i === 0 ? 0 : headerLineHeight}"${fitTextAttrs(line)}>${escapeXML(line || "")}</tspan>`,
        )
        .join("")}
    </text>
  `;
};

const templates = [
  {
    name: "Bold Gradient",
    svg: ({
      WIDTH,
      HEIGHT,
      IMAGE_HEIGHT,
      title,
      titleLines,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title, titleLines })}
        <defs>
          <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#fff"/>
            <stop offset="100%" stop-color="#FBBF24"/>
          </linearGradient>
        </defs>
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#1D4ED8" />
        <circle cx="320" cy="${IMAGE_HEIGHT + 120}" r="220" fill="rgba(255,255,255,0.05)" />
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="rgba(0,0,0,0.3)" />
        <text x="60" y="${IMAGE_HEIGHT + 50}" fill="#F8FAFC" font-size="24" font-family="${ENGLISH_FONT_FAMILIES.condensed}" font-weight="700">LATEST UPDATE</text>
        ${renderMultilineText({
          x: 60,
          y: IMAGE_HEIGHT + 130,
          lines,
          fill: "url(#textGrad)",
          fontFamily: fontForText(lines.join(" "), ENGLISH_FONT_FAMILIES.brand),
          fontSize: getOptimizedFontSize(lines.join(" "), 54, 40),
          fontWeight: 800,
          lineHeight: 54,
        })}
        <rect x="60" y="${IMAGE_HEIGHT + 340}" width="220" height="50" rx="25" fill="#F59E0B" />
        <text x="170" y="${IMAGE_HEIGHT + 375}" fill="#111827" font-size="24" font-family="${ENGLISH_FONT_FAMILIES.brand}" font-weight="700" text-anchor="middle">TRENDING</text>
        ${newsFooter({ WIDTH, HEIGHT, bottomSectionHeight, downloadBase64, logoNewBase64 })}
      </svg>
      `;
    },
  },
  {
    name: "Soft Neon",
    svg: ({
      WIDTH,
      HEIGHT,
      IMAGE_HEIGHT,
      title,
      titleLines,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title, titleLines })}
        <defs>
          <radialGradient id="halo" cx="50%" cy="30%" r="50%">
            <stop offset="0%" stop-color="rgba(59,130,246,0.5)"/>
            <stop offset="100%" stop-color="transparent"/>
          </radialGradient>
        </defs>
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#020617" />
        <rect x="40" y="${IMAGE_HEIGHT + 30}" width="1000" height="280" rx="40" fill="rgba(15,23,42,0.92)" />
        <circle cx="900" cy="${IMAGE_HEIGHT + 100}" r="180" fill="url(#halo)" />
        <text x="80" y="${IMAGE_HEIGHT + 70}" fill="#38BDF8" font-size="28" font-family="${ENGLISH_FONT_FAMILIES.modern}" font-weight="700">NEW FLASH</text>
        ${renderMultilineText({
          x: 80,
          y: IMAGE_HEIGHT + 130,
          lines,
          fill: "#F8FAFC",
          fontFamily: fontForText(lines.join(" "), ENGLISH_FONT_FAMILIES.clean),
          fontSize: getOptimizedFontSize(lines.join(" "), 50, 38),
          fontWeight: 800,
          lineHeight: 56,
        })}
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
      titleLines,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title, titleLines })}
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#111827" />
        <rect x="60" y="${IMAGE_HEIGHT + 30}" width="960" height="280" rx="40" fill="rgba(15,23,42,0.88)" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
        <rect x="640" y="${IMAGE_HEIGHT + 50}" width="320" height="80" rx="30" fill="#2563EB" />
        <text x="670" y="${IMAGE_HEIGHT + 90}" fill="#fff" font-size="24" font-family="${ENGLISH_FONT_FAMILIES.brand}" font-weight="700">BREAKING</text>
        <text x="90" y="${IMAGE_HEIGHT + 90}" fill="#E2E8F0" font-size="24" font-family="${ENGLISH_FONT_FAMILIES.editorial}" font-weight="700">TODAY</text>
        ${renderMultilineText({
          x: 90,
          y: IMAGE_HEIGHT + 150,
          lines,
          fill: "#FFFFFF",
          fontFamily: fontForText(lines.join(" "), ENGLISH_FONT_FAMILIES.modern),
          fontSize: getOptimizedFontSize(lines.join(" "), 50, 38),
          fontWeight: 800,
          lineHeight: 56,
        })}
        <rect x="90" y="${IMAGE_HEIGHT + 330}" width="260" height="45" rx="23" fill="#22C55E" />
        <text x="220" y="${IMAGE_HEIGHT + 358}" fill="#fff" font-size="20" font-family="${ENGLISH_FONT_FAMILIES.clean}" font-weight="700" text-anchor="middle">INSIDE STORY</text>
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
      titleLines,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title, titleLines })}
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="80" fill="#F97316" />
        <rect x="0" y="${IMAGE_HEIGHT + 80}" width="${WIDTH}" height="80" fill="#0891B2" />
        <rect x="0" y="${IMAGE_HEIGHT + 160}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT - 160}" fill="#0EA5E9" />
        <text x="60" y="${IMAGE_HEIGHT + 50}" fill="#fff" font-size="26" font-family="${ENGLISH_FONT_FAMILIES.modern}" font-weight="700">SPOTLIGHT</text>
        <text x="60" y="${IMAGE_HEIGHT + 130}" fill="#fff" font-size="26" font-family="${ENGLISH_FONT_FAMILIES.condensed}" font-weight="700">LATEST HEADLINES</text>
        ${renderMultilineText({
          x: 60,
          y: IMAGE_HEIGHT + 210,
          lines,
          fill: "#0F172A",
          fontFamily: fontForText(lines.join(" "), ENGLISH_FONT_FAMILIES.slab),
          fontSize: getOptimizedFontSize(lines.join(" "), 50, 38),
          fontWeight: 800,
          lineHeight: 56,
        })}
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
      titleLines,
      lines,
      downloadBase64,
      logoNewBase64,
    }) => {
      const bottomSectionHeight = 200;
      return `
      <svg width="${WIDTH}" height="${HEIGHT}">
        ${templateHeader({ WIDTH, title, titleLines })}
        <rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#F8FAFC" />
        <rect x="40" y="${IMAGE_HEIGHT + 20}" width="1000" height="300" rx="40" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
        <rect x="60" y="${IMAGE_HEIGHT + 30}" width="240" height="50" rx="30" fill="#8B5CF6" />
        <text x="180" y="${IMAGE_HEIGHT + 65}" fill="#fff" font-size="24" font-family="${ENGLISH_FONT_FAMILIES.slab}" font-weight="700" text-anchor="middle">TOP STORY</text>
        ${renderMultilineText({
          x: 60,
          y: IMAGE_HEIGHT + 120,
          lines,
          fill: "#111827",
          fontFamily: fontForText(lines.join(" "), ENGLISH_FONT_FAMILIES.editorial),
          fontSize: getOptimizedFontSize(lines.join(" "), 50, 38),
          fontWeight: 800,
          lineHeight: 56,
        })}
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
  const titleText = title || description || "NEWS CARD SORT";
  const bodyText = text || description || titleText;
  const lines = wrapText(bodyText, 34, 4, true);
  const titleLines = wrapText(
    titleText,
    TITLE_MAX_CHARS,
    TITLE_MAX_LINES,
    true,
  );

  // Load logos
  let downloadBase64 = "";
  let logoNewBase64 = "";
  try {
    const downloadBuffer = fs.readFileSync(
      path.join(__dirname, "../assets/google_paly_download.png"),
    );
    downloadBase64 = downloadBuffer.toString("base64");
  } catch (err) {
    console.warn("Download button not found");
  }
  try {
    const logoNewBuffer = fs.readFileSync(
      path.join(__dirname, "../assets/logo_new.png"),
    );
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
    title: titleText,
    titleLines,
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

function wrapText(text, maxChars, maxLines = 4, padToFullLines = false) {
  const words = String(text || "")
    .split(" ")
    .filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words.flatMap((word) => splitLongWord(word, maxChars))) {
    if ((line + word).length > maxChars) {
      if (line.trim()) {
        lines.push(line.trim());
      }
      line = word + " ";
    } else {
      line += word + " ";
    }
  }

  if (line.trim()) {
    lines.push(line.trim());
  }

  const truncated = lines.slice(0, maxLines);

  if (padToFullLines) {
    while (truncated.length < maxLines) {
      truncated.push("");
    }
  }

  return truncated;
}

function splitLongWord(word, maxChars) {
  if (word.length <= maxChars) {
    return [word];
  }

  const chunks = [];
  for (let i = 0; i < word.length; i += maxChars) {
    chunks.push(word.slice(i, i + maxChars));
  }
  return chunks;
}

function fitTextAttrs(line) {
  return line && !line.includes(" ") && line.length >= TITLE_MAX_CHARS
    ? ` textLength="${TITLE_MAX_WIDTH}" lengthAdjust="spacingAndGlyphs"`
    : "";
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
