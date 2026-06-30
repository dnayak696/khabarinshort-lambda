const axios = require("axios");
const cheerio = require("cheerio");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const cleanTitle = require("../utils/cleanTitle.js");
const cleanDescription = require("../utils/cleanDescription.js");

const URL = "https://www.dharitri.com/";
const ARTICLE_CARD_SELECTOR = "article.post";
const BUCKET = process.env.NEWS_BUCKET || "khabarinshort";
const PREFIX = process.env.DHARITRI_KEY || "dharitri.json";
const AXIOS_CONFIG = {
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0" },
};

const navLinks = [
  "https://www.dharitri.com/category/state-news/",
  "https://www.dharitri.com/category/odisha-special/",
  "https://www.dharitri.com/category/international-news/",
  "https://www.dharitri.com/category/business/",
  "https://www.dharitri.com/category/entertainment/",
  "https://www.dharitri.com/category/education-employment/",
];
async function scrapeDharitriPost(postUrl) {
  if (!postUrl) {
    return null;
  }

  try {
    const res = await axios.get(postUrl, AXIOS_CONFIG);
    const $ = cheerio.load(res.data);

    const urlParts = postUrl.split("/");
    const slug = urlParts.filter(Boolean).pop();
    const id = slug;

    const title = cleanTitle($("h1.my_menu").text());
    const postedAt = $("time.entry-date.published").attr("datetime");
    // Updated image selector: fallback to first img if figure fails
    const postImageUrl = $(".post-thumbnail img").attr("src");

    // Extract description: fallback to all <p> if entry-content is empty

    const description = cleanDescription(
      $("p")
        .map((_, el) => $(el).text())
        .get()
        .slice(0, 4)
        .join(" "),
    );

    const group = "general";

    return {
      id,
      title,
      postedAt,
      postSourceLink: postUrl,
      postSourceName: "dharitri",
      group,
      description,
      postImageUrl,
    };
  } catch (err) {
    console.error(`❌ Failed to scrape ${postUrl}:`, err.message);
    return null;
  }
}

exports.handler = async () => {
  await axios.get(URL, AXIOS_CONFIG);
  const filteredNavList = navLinks.slice(1, 11);
  const tmpPostList = [];
  let postList;

  for (const navUrl of filteredNavList) {
    try {
      const resp = await axios.get(navUrl, AXIOS_CONFIG);
      const $ = cheerio.load(resp.data);
      $(ARTICLE_CARD_SELECTOR).each((_, el) => {
        const link = $(el).find(".thumbnail a").attr("href");
        if (link) {
          tmpPostList.push(link);
        }
      });
    } catch (e) {
      console.error("Error scraping", navUrl, e.message);
    }
  }

  const scrapeTasks = tmpPostList.map((postUrl) => scrapeDharitriPost(postUrl));
  const results = await Promise.all(scrapeTasks);
  postList = results.filter(Boolean);

  await s3
    .putObject({
      Bucket: BUCKET,
      Key: PREFIX,
      ContentType: "application/json",
      Body: JSON.stringify(
        { articles: postList, scrapedAt: new Date().toISOString() },
        null,
        2,
      ),
    })
    .promise();

  console.log(`Dharitri: ${postList.length} articles saved`);

  return {
    statusCode: 200,
    body: JSON.stringify({ articles: postList.length }),
  };
};
