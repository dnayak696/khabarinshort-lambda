const AWS = require("aws-sdk");
const path = require("path");
const fs = require("fs").promises;
const axios = require("axios");
const { generateMobilePost } = require("../services/postImageGenarator");

const s3 = new AWS.S3();

const BUCKET_NAME = process.env.POST_IMAGES_BUCKET || "khabarinshort";
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || "";

// const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
// const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
// const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
// const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
// const THREADS_API_TOKEN = process.env.THREADS_API_TOKEN;

exports.handler = async (event) => {
  const body = parseBody(event);
  const articles = Array.isArray(body.articles) ? body.articles : [];

  if (articles.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "No articles provided in request body." }),
    };
  }

  const results = [];

  for (const article of articles) {
    const articleId =
      article.id ||
      article.slug ||
      slugify(article.title || `article-${Date.now()}`);
    const imageUrl = article.postImageUrl || article.imageUrl;
    const title = article.title || "News Update";
    const caption = buildCaption(article);
    const description = getFirstOdiaSentence(
      article.description || article.summary || "",
    );
    const text = description || title;
    const localFileName = `${slugify(articleId)}-${Date.now()}.jpg`;
    const localOutputPath = path.join("/tmp", localFileName);
    const s3Key = `social-post-images/${localFileName}`;

    if (!imageUrl) {
      results.push({
        articleId,
        error: "Missing image URL",
      });
      continue;
    }

    try {
      await generateMobilePost({
        imageUrl,
        title,
        text,
        description,
        outputPath: localOutputPath,
      });

      const uploadedUrl = await uploadImageToS3(localOutputPath, s3Key);
      const config = {
        caption: article.caption,
        image_url: uploadedUrl,
      };
      const page = pageList.find((page) => page.group === article.group);
      const mainPage = pageList.find((page) => page.group === "general");
      if (page) {
        await publishFacebookMedia(page, config);
      }

      await publishFacebookMedia(mainPage, config);

      // const instagram = await createInstagramMediaContainer({
      //   instagramAccountId: INSTAGRAM_ACCOUNT_ID,
      //   accessToken: INSTAGRAM_ACCESS_TOKEN,
      //   imageUrl: uploadedUrl,
      //   caption,
      // });
      // const threads = await createThreadsDraft({
      //   accessToken: THREADS_API_TOKEN,
      //   caption,
      //   imageUrl: uploadedUrl,
      // });

      results.push({
        articleId,
        cloudFrontUrl: uploadedUrl,
        facebook,
        // instagram,
        // threads,
      });
    } catch (error) {
      results.push({
        articleId,
        error: error.message || String(error),
      });
    } finally {
      await cleanupTempFile(localOutputPath);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ results }, null, 2),
  };
};

async function publishFacebookMedia(page, config) {
  const url = `https://graph.facebook.com/v25.0/${page.id}/media`;

  try {
    const response = await axios.post(url, null, {
      // Axios injects these into the URL as key=value pairs automatically
      params: {
        caption: config.caption,
        access_token: page.access_token,
        image_url: config.image_url,
        published: true,
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Post Published Successfully:", response.data);
    return response.data;
  } catch (error) {
    // Axios captures detailed API error responses here
    if (error.response) {
      console.error("❌ Graph API Error Data:", error.response.data);
    } else {
      console.error("❌ Request Setup Error:", error.message);
    }
    throw error;
  }
}

function parseBody(event = {}) {
  if (Array.isArray(event.articles)) {
    return event;
  }

  if (typeof event.body === "string") {
    return JSON.parse(event.body || "{}");
  }

  return event.body || {};
}

function toPlainText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(toPlainText).filter(Boolean).join(" ");
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function getFirstOdiaSentence(value) {
  const text = toPlainText(value);
  const odiaFullStopIndex = text.indexOf("।");

  if (odiaFullStopIndex !== -1) {
    return text.slice(0, odiaFullStopIndex + 1).trim();
  }

  return text.split(/\r?\n/)[0].trim();
}

async function publishFacebookPostForArticle({ article, imageUrl, caption }) {
  const articleGroup = getArticleGroupName(article);

  if (!articleGroup) {
    return { skipped: true, reason: "Article is missing group name" };
  }

  const page = await findFacebookPageByGroup(articleGroup);

  if (!page) {
    return {
      skipped: true,
      reason: `No Facebook page found for group "${articleGroup}"`,
    };
  }

  try {
    return await createFacebookPost({
      pageId: getFacebookPageId(page),
      accessToken: getFacebookPageAccessToken(page),
      imageUrl,
      caption,
    });
  } catch (error) {
    return {
      error: error.message || String(error),
      pageId: getFacebookPageId(page),
      group: getFacebookPageGroupName(page),
    };
  }
}

async function findFacebookPageByGroup(group) {
  const normalizedGroup = normalizeGroupName(group);
  const pages = await getFacebookPagesByGroup(group);

  return pages.find(
    (page) =>
      normalizeGroupName(getFacebookPageGroupName(page)) === normalizedGroup,
  );
}

function normalizeGroupName(value) {
  return toPlainText(value).toLowerCase();
}

async function uploadImageToS3(localPath, key) {
  const fileBody = await fs.readFile(localPath);

  await s3
    .putObject({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBody,
      ContentType: "image/jpeg",
    })
    .promise();

  if (!CLOUDFRONT_DOMAIN) {
    return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
  }

  return `https://${CLOUDFRONT_DOMAIN}/${key}`;
}

async function createFacebookPost({ pageId, accessToken, imageUrl, caption }) {
  if (!pageId || !accessToken) {
    return { skipped: true, reason: "Missing Facebook page credentials" };
  }

  const url = `https://graph.facebook.com/v17.0/${encodeURIComponent(pageId)}/photos`;
  const params = new URLSearchParams({
    url: imageUrl,
    caption,
    published: "true",
    access_token: accessToken,
  });

  const response = await axios.post(url, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return response.data;
}

async function createInstagramMediaContainer({
  instagramAccountId,
  accessToken,
  imageUrl,
  caption,
}) {
  if (!instagramAccountId || !accessToken) {
    return { skipped: true, reason: "Missing Instagram credentials" };
  }

  const url = `https://graph.facebook.com/v17.0/${encodeURIComponent(instagramAccountId)}/media`;
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });

  const response = await axios.post(url, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return response.data;
}

async function createThreadsDraft({ accessToken, caption, imageUrl }) {
  if (!accessToken) {
    return { skipped: true, reason: "Missing Threads API token" };
  }

  // Threads does not currently expose a stable public media draft API.
  // This function returns draft payload for later submission or integration.
  return {
    draft: {
      caption,
      imageUrl,
      status: "created",
      note: "Replace this stub with real Threads API integration when available.",
    },
  };
}

function buildCaption(article) {
  const parts = [];
  if (article.caption) return article.caption;
  if (article.title) parts.push(article.title);
  if (article.description) parts.push(article.description);
  if (article.postSourceLink)
    parts.push(`Read more: ${article.postSourceLink}`);
  return parts.join("\n\n");
}

function slugify(str) {
  return str
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

async function cleanupTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    // ignore missing temp file cleanup errors
  }
}

const pageList = [
  {
    access_token:
      "EAGA60BdmGbIBSPilyHqRaEHIZCfd4HdXrJbMMe6bnhX3XgGtmvL4EMQQ78rEC3ggTErImgX1kIGgixZBM9yZAm4WmaWjfWVqZAMAY8MusKl6RDSm3X1r87FaHW7dHPY9WkGaOpSZCQ3PzvShjyvYIjY2DgaFOFZBNvyGexqAZBeBgIVxzvwP86M6AHBh1w0ihRZBKucnvqEwC3eggovBj7fMH7NVhs2omQmSu1uOu4EZD",
    category: "News & media website",
    category_list: [
      {
        id: "2709",
        name: "News & media website",
      },
      {
        id: "2233",
        name: "Media/news company",
      },
    ],
    name: "Khabar In short Jobs",
    group: "jobs",
    id: "1312385301948534",
    tasks: [
      "MODERATE",
      "MESSAGING",
      "ANALYZE",
      "ADVERTISE",
      "CREATE_CONTENT",
      "MANAGE",
    ],
  },
  {
    access_token:
      "EAGA60BdmGbIBSPrbQVdQAsWQZBm3gM8m45hSpihCNr5hMZBZBpwlhzPam7V393JkgQIeB7dstQmQ5vtchUj02viKD1ebOGsZBwVibaAt06ZALKiz8fnPszJxS4D1eXFWNkJiM2Af23NSotXTWORgyRPsmZCA32K35usDMdALeXWY9PinfKBuchfX6T7ldGKVu5IHiHyZBLQkYlETzT08cmstx9yj1ZCDZCf1pp8cZCqQZDZD",
    category: "News & media website",
    category_list: [
      {
        id: "2709",
        name: "News & media website",
      },
    ],
    name: "Khabar in short",
    group: "general",
    id: "106106792088947",
    tasks: [
      "MODERATE",
      "MESSAGING",
      "ANALYZE",
      "ADVERTISE",
      "CREATE_CONTENT",
      "MANAGE",
    ],
  },
];
