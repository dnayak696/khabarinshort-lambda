const AWS = require("aws-sdk");
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const admin = require("firebase-admin");
const cloudfront = new AWS.CloudFront();

const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const bedrockRuntime = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "google.gemma-3-12b-it";
const BEDROCK_MAX_OUTPUT_TOKENS =
  parseInt(process.env.BEDROCK_MAX_OUTPUT_TOKENS, 10) || 700;
const BEDROCK_TEMPERATURE = parseFloat(process.env.BEDROCK_TEMPERATURE) || 0.2;

const SOURCES = (process.env.AGGREGATOR_SOURCES || "sambad.json,dharitri.json")
  .split(",")
  .map((source) => source.trim())
  .filter(Boolean);
const BUCKET = process.env.NEWS_BUCKET || "khabarinshort";
const LATEST_KEY = process.env.LATEST_NEWS_KEY || "latest.json";
const NOTIFICATION_TOPIC = process.env.FCM_TOPIC || "all";
const POST_CREATOR_FUNCTION_NAME = process.env.POST_CREATOR_FUNCTION_NAME || "";

// MAIN LAMBDA HANDLER
exports.handler = async () => {
  const allArticles = [];

  // Load all sources
  for (const file of SOURCES) {
    const data = await getObject(file);
    allArticles.push(...(data.articles || []));
  }

  // Deduplicate
  const seen = new Set();
  const deduped = allArticles.filter((article) => {
    const key = `${article.postSourceLink}-${article.postSourceName || article.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort articles
  deduped.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

  // Find previous articles
  const previousData = await getObject(LATEST_KEY);
  const prevLinks = new Set(
    (previousData.articles || []).map((a) => a.postSourceLink),
  );
  const newArticles = deduped.filter(
    (article) => !prevLinks.has(article.postSourceLink),
  );

  const newsList = deduped.map((article) => {
    if (!prevLinks.has(article.postSourceLink)) {
      return article;
    } else {
      return (
        previousData.articles.find(
          (a) => a.postSourceLink === article.postSourceLink,
        ) || article
      );
    }
  });
  const newsMediaList = [];
  for (const article of newArticles) {
    const title = toPlainText(article.title);
    const sourceText = toPlainText(
      article.description || article.summary || article.title,
    );
    const summaryResult = sourceText
      ? await summarizeWithBedrock(sourceText)
      : {
          summary: toPlainText(article.description || article.summary),
          caption: toPlainText(
            article.description || article.summary || article.title,
          ),
          description: toPlainText(
            article.description || article.summary || article.title,
          ),
        };

    // Update new article fields directly
    article.odiaTitle = title;
    article.odiaSummary = summaryResult.summary;
    article.odiaCaption = summaryResult.caption;
    article.odiaDescription = summaryResult.description;

    // Add to media list for social post generation
    newsMediaList.push({
      id: article.id,
      title: article.odiaTitle,
      summary: article.odiaSummary,
      caption: article.odiaCaption,
      description: article.odiaDescription,
      postImageUrl: article.postImageUrl || article.imageUrl,
      postSourceLink: article.postSourceLink,
      postSourceName: article.postSourceName || article.source,
      group: article.group,
    });

    // Update inside deduped list
    const index = newsList.findIndex(
      (a) => a.postSourceLink === article.postSourceLink,
    );
    if (index !== -1) {
      newsList[index].odiaTitle = title;
      newsList[index].odiaSummary = summaryResult.summary;
      newsList[index].odiaCaption = summaryResult.caption;
      newsList[index].odiaDescription = summaryResult.description;
    }
  }

  // If new articles exist → update file + notify
  if (newArticles.length > 0) {
    // Save updated merged data so previously summarized server records are retained.
    await s3
      .putObject({
        Bucket: BUCKET,
        Key: LATEST_KEY,
        Body: JSON.stringify(
          {
            updatedAt: new Date().toISOString(),
            articles: newsList,
          },
          null,
          2,
        ),
        ContentType: "application/json",
      })
      .promise();

    // CDN invalidation
    await invalidateCache(process.env.CLOUDFRONT_DISTRIBUTION_ID, ["/*"]);

    // Create social media post images for all new articles.
    await invokePostCreator(newsMediaList);

    // Send notifications & send post on social media to get more engagement
    for (const article of newArticles.slice(0, 1)) {
      await sendFCMNotification(article);
    }

    console.log(`Processed & notified ${newArticles.length} new articles`);
  } else {
    console.log("No new articles.");
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      total: newsList.length,
      newArticles: newArticles.length,
    }),
  };
};

function getFirebaseCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(
      Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
        "base64",
      ).toString("utf8"),
    );
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  return require("../utils/ksmobile-48697-firebase-adminsdk-kkot5-2e3117d06a.json");
}

function getFirebaseApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  return admin.initializeApp({
    credential: admin.credential.cert(getFirebaseCredential()),
  });
}

function toPlainText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(toPlainText).filter(Boolean).join(" ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function truncateText(value, maxLength) {
  return toPlainText(value).slice(0, maxLength);
}

function toFcmData(article) {
  return {
    id: truncateText(article.id, 120),
    source: truncateText(article.postSourceName || article.source, 60),
    group: truncateText(article.group, 60),
    postSourceLink: truncateText(article.postSourceLink, 500),
    title: truncateText(article.odiaTitle || article.title, 120),
  };
}

async function summarizeWithBedrock(text) {
  const fallback = {
    summary: truncateText(text, 300),
    caption: truncateText(text, 200),
    description: truncateText(text, 300),
  };

  if (!BEDROCK_MODEL_ID) {
    return fallback;
  }

  const prompt =
    `You are generating social media content for a news article in Odia only.\n` +
    `Return ONLY one valid JSON object with exactly these three keys: summary, caption, description.\n` +
    `Do not include any commentary, markdown, explanation, or extra keys.\n` +
    `Rules:\n` +
    `- summary: one short Odia summary in 1-2 sentences, factual and concise. Write fully in Odia.\n` +
    `- caption: one short social-media caption for a mobile post image, catchy and relevant, fully in Odia.\n` +
    `- description: one short description for the post image, 1 sentence only, fully in Odia.\n` +
    `- Do not mix in Hindi, English, or other languages. Keep the response entirely in Odia script and vocabulary.\n` +
    `- Use plain text only. No emojis, no hashtags, no quotes around values.\n` +
    `Example format: {"summary":"...","caption":"...","description":"..."}\n\n` +
    `Article Text:\n${text}`;

  try {
    console.log(`Invoking Bedrock with model ${BEDROCK_MODEL_ID}`);

    const command = new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: BEDROCK_MAX_OUTPUT_TOKENS,
        temperature: BEDROCK_TEMPERATURE,
      },
    });

    const response = await bedrockRuntime.send(command);
    const responseText =
      response.output?.message?.content?.find((item) => item.text)?.text || "";
    const normalizedBody = stripMarkdownJsonFence(responseText);

    if (!normalizedBody) {
      return fallback;
    }

    const parsed = parseBedrockJsonResponse(normalizedBody);

    if (!parsed) {
      const cleanText = stripJsonFieldLabel(normalizedBody);
      return {
        summary: toPlainText(cleanText).slice(0, 300),
        caption: toPlainText(cleanText).slice(0, 200),
        description: toPlainText(cleanText).slice(0, 300),
      };
    }

    const generatedText = extractBedrockText(parsed, normalizedBody);

    return {
      summary: toPlainText(parsed.summary || generatedText).slice(0, 300),
      caption: toPlainText(
        parsed.caption || parsed.title || parsed.summary || generatedText,
      ).slice(0, 2200),
      description: toPlainText(
        parsed.description || parsed.summary || generatedText,
      ).slice(0, 300),
    };
  } catch (err) {
    console.error("Bedrock summarization failed:", err.message || err);
    return fallback;
  }
}

function stripMarkdownJsonFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseBedrockJsonResponse(value) {
  const normalizedBody = stripMarkdownJsonFence(value);
  const candidates = [normalizedBody];
  const jsonMatch = normalizedBody.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    candidates.push(jsonMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (ignore) {
      // Try the next parser strategy below.
    }
  }

  return extractJsonStringFields(normalizedBody);
}

function extractJsonStringFields(value) {
  const fields = {};

  for (const field of ["summary", "caption", "description"]) {
    const fieldRegex = new RegExp(
      `"${field}"\\s*:\\s*"([\\s\\S]*?)(?:"\\s*,\\s*"(?:summary|caption|description)"|"\\s*\\}|$)`,
      "i",
    );
    const match = value.match(fieldRegex);

    if (match?.[1]) {
      fields[field] = cleanJsonStringFragment(match[1]);
    }
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

function cleanJsonStringFragment(value) {
  return String(value || "")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

function stripJsonFieldLabel(value) {
  return String(value || "")
    .replace(/^summary\s*:\s*/i, "")
    .replace(/^\{\s*"summary"\s*:\s*"/i, "")
    .replace(/"\s*,\s*"(?:caption|description)"[\s\S]*$/i, "")
    .replace(/"\s*\}?\s*$/i, "")
    .trim();
}

function extractBedrockText(parsed, fallbackText) {
  if (!parsed) {
    return fallbackText;
  }

  return (
    parsed.content?.[0]?.text ||
    parsed.results?.[0]?.outputText ||
    parsed.outputText ||
    parsed.completion ||
    parsed.generated_text ||
    parsed.text ||
    parsed.body ||
    fallbackText
  );
}

function buildSocialCaption(article) {
  const caption = toPlainText(
    article.odiaCaption ||
      article.caption ||
      article.odiaSummary ||
      article.summary ||
      article.description,
  );
  const sourceLink = toPlainText(article.postSourceLink);
  const parts = [];

  if (caption) parts.push(caption);
  if (sourceLink) parts.push(`Read more: ${sourceLink}`);

  return parts.join("\n\n").slice(0, 2200);
}

function toSocialPostArticle(article) {
  const title = toPlainText(article.odiaTitle || article.title);
  const description = toPlainText(
    article.odiaDescription ||
      article.odiaSummary ||
      article.summary ||
      article.description,
  );
  const imageUrl = toPlainText(article.postImageUrl || article.imageUrl);

  return {
    id: toPlainText(article.id || article.postSourceLink || title),
    title,
    description,
    summary: description,
    caption: buildSocialCaption(article),
    postImageUrl: imageUrl,
    imageUrl,
    postSourceLink: toPlainText(article.postSourceLink),
    postSourceName: toPlainText(article.postSourceName || article.source),
    group: toPlainText(article.group),
  };
}

// Read S3 object
const getObject = async (Key) => {
  try {
    const data = await s3.getObject({ Bucket: BUCKET, Key }).promise();
    return JSON.parse(data.Body.toString());
  } catch (e) {
    console.error(`Failed to read ${Key}:`, e.message);
    return { articles: [] };
  }
};

// Push notification to FCM
const sendFCMNotification = async (article) => {
  const app = getFirebaseApp();
  const title = truncateText(article.odiaTitle || article.title, 100);
  const body = truncateText(
    article.odiaSummary || article.summary || article.description,
    200,
  );
  const image = article.imageUrl;
  const message = {
    notification: {
      title: title || "Khabar In Short",
      body: body || title || "New article published",
      image: image || undefined,
    },
    data: toFcmData(article),
    topic: NOTIFICATION_TOPIC,
  };
  try {
    return await app.messaging().send(message);
  } catch (error) {
    console.error("FCM Error:", error);
  }
};

// CloudFront cache invalidation
const invalidateCache = async (distributionId, paths) => {
  if (!distributionId) {
    console.warn("Skipping CloudFront invalidation: missing distribution ID");
    return;
  }

  try {
    await cloudfront
      .createInvalidation({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `${Date.now()}`,
          Paths: { Quantity: paths.length, Items: paths },
        },
      })
      .promise();
  } catch (err) {
    console.error("Invalidation Error:", err);
  }
};

const invokePostCreator = async (articles) => {
  if (!POST_CREATOR_FUNCTION_NAME) {
    console.warn("Skipping post creator: missing function name");
    return;
  }

  const socialArticles = articles
    .map(toSocialPostArticle)
    .filter((article) => article.title && article.imageUrl);

  if (socialArticles.length === 0) {
    console.log("Skipping post creator: no new articles with images");
    return;
  }

  try {
    await lambda
      .invoke({
        FunctionName: POST_CREATOR_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: JSON.stringify({ articles: socialArticles }),
      })
      .promise();

    console.log(`Queued ${socialArticles.length} articles for post creator`);
  } catch (error) {
    console.error("Post creator invoke error:", error);
  }
};
