const AWS = require("aws-sdk");
const admin = require("firebase-admin");
const cloudfront = new AWS.CloudFront();

const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

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

  // PASS ORIGINAL DATA DIRECTLY (NO SUMMARIZATION)
  for (const article of newArticles) {
    const title = toPlainText(article.title);
    const summary = toPlainText(article.description || article.summary);

    // Update new article fields directly
    article.odiaTitle = title;
    article.odiaSummary = summary;

    // Update inside deduped list
    const index = deduped.findIndex(
      (a) => a.postSourceLink === article.postSourceLink,
    );
    if (index !== -1) {
      deduped[index].odiaTitle = title;
      deduped[index].odiaSummary = summary;
    }
  }

  // If new articles exist → update file + notify
  if (newArticles.length > 0) {
    // Save updated deduped data
    await s3
      .putObject({
        Bucket: BUCKET,
        Key: LATEST_KEY,
        Body: JSON.stringify(
          {
            updatedAt: new Date().toISOString(),
            articles: deduped,
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
    await invokePostCreator(newArticles);

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
      total: deduped.length,
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

function buildSocialCaption(article) {
  const parts = [];
  const title = toPlainText(article.odiaTitle || article.title);
  const description = toPlainText(
    article.odiaSummary || article.summary || article.description,
  );
  const sourceLink = toPlainText(article.postSourceLink);

  if (title) parts.push(title);
  if (description) parts.push(description);
  if (sourceLink) parts.push(`Read more: ${sourceLink}`);

  return parts.join("\n\n").slice(0, 2200);
}

function toSocialPostArticle(article) {
  const title = toPlainText(article.odiaTitle || article.title);
  const description = toPlainText(
    article.odiaSummary || article.summary || article.description,
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
  const image = truncateText(article.postImageUrl || article.imageUrl, 1000);
  const message = {
    notification: {
      title: title || "Khabar In Short",
      body: body || title || "New article published",
    },
    data: toFcmData(article),
    topic: NOTIFICATION_TOPIC,
  };

  if (image) {
    message.notification.image = image;
  }

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
