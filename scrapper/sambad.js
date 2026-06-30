const axios = require("axios");
const cheerio = require("cheerio");
const { v4: uuidv4 } = require("uuid");
const { S3 } = require("aws-sdk");
const s3 = new S3();
const bucketName = process.env.NEWS_BUCKET || "khabarinshort";
const fileName = process.env.SAMBAD_KEY || "sambad.json";
const AXIOS_CONFIG = {
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0" },
};

const groups = [
  "india-and-beyond",
  "state",
  "sports",
  "business",
  "politics",
  "entertainment",
  "crime",
  "jobs",
];

exports.handler = async () => {
  console.log("Scraper Started");
  const data2 = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];

    const categoryName = group;
    const categoryNews = [];
    try {
      const res = await axios.get(`https://sambad.in/${group}`, AXIOS_CONFIG);

      console.log(`Status Code for ${group}:`, res.status);
      if (res.status === 200) {
        const postList = [];

        const $ = cheerio.load(res.data);
        const siteHeading = $(".gh-posts-feed-post");
        console.log("siteHeading", siteHeading.length);
        siteHeading.each((index, el) => {
          const postUrl = $(el).find("h2 a").attr("href");
          const publishedAt = $(el).find("time").attr("datetime");
          console.log("post URL", postUrl);
          console.log("Published At", publishedAt);
          postList.push({ postUrl, publishedAt });
        });
        for (const data of postList.filter((item) => item.postUrl)) {
          try {
            const res1 = await axios.get(data.postUrl, AXIOS_CONFIG);
            const $1 = cheerio.load(res1.data);
            const id = uuidv4();
            const article = $1("article");
            const postImageUrl = article
              .find(".gh-post-page__featured-img picture img")
              .attr("src");

            const title = article.children("header").children("h1").text();
            const description = [];

            article
              .find(".post-content p")
              .filter((i, el) => {
                const $p = $(el);
                // Clone so we don't modify original DOM
                const clone = $p.clone();

                // Text including anchors
                const fullText = clone.text().replace(/\s+/g, " ").trim();

                // Remove the ଆହୁରି ପଢ଼ନ୍ତୁ: contains para
                if (fullText.includes("ଆହୁରି ପଢ଼ନ୍ତୁ:")) {
                  return false;
                }

                // Remove anchors and get remaining text
                clone.find("a").remove();
                const textWithoutAnchors = clone
                  .text()
                  .replace(/\s+/g, " ")
                  .trim();

                // Skip if all text came from anchor tags
                return !(fullText && !textWithoutAnchors);
              })
              .slice(0, 4)
              .each((i, e) => {
                description.push($1(e).text());
              });

            const newDescription = description;

            const postedAt = convertToISOWithTimezone(data.publishedAt);
            const news = {
              id,
              title,
              postedAt: postedAt,
              postSourceLink: data.postUrl,
              postSourceName: "sambad",
              group,
              description: newDescription,
              postImageUrl,
            };
            data2.push(news);
            categoryNews.push(news);
            //save category in a file ;
          } catch (err) {
            console.error("Error fetching post details:", err.message);
          }
        }
      }

      //Save Category File
      // filter the file if the data alredy exist then Skip the file
      // Update only new Data
      await saveNewsByCategory(categoryName, categoryNews);
    } catch (err) {
      console.error("Error fetching group page:", err.message);
    }
  }

  // Upload data to S3

  try {
    const params = {
      Bucket: bucketName,
      Key: fileName,
      Body: JSON.stringify(
        { updatedAt: new Date().toISOString(), articles: data2 },
        null,
        2,
      ),
      ContentType: "application/json",
    };
    await s3.putObject(params).promise();
    console.log("Data successfully uploaded to S3");
  } catch (err) {
    console.error("Error uploading to S3:", err.message);
  }

  return {
    statusCode: 200,
    body: "Data scrapped",
  };
};

function convertToISOWithTimezone(dateString) {
  // Parse the input date string
  const date = new Date(dateString);

  // Get timezone offset for IST (+05:30)
  const istOffset = 5.5 * 60; // 5.5 hours in minutes

  // Create new date with IST offset
  const istDate = new Date(date.getTime() + istOffset * 60 * 1000);

  // Format to ISO string and replace Z with +05:30
  const isoString = istDate.toISOString().replace("Z", "+05:30");

  return isoString;
}

function saveNewsByCategory(categoryName, categoryNews) {
  const fileName = `${categoryName}.json`;
  const params = {
    Bucket: bucketName,
    Key: fileName,
    Body: JSON.stringify(categoryNews, null, 2),
    ContentType: "application/json",
  };
  return s3
    .putObject(params)
    .promise()
    .then(() => {
      console.log(`Data successfully uploaded to S3: ${fileName}`);
    })
    .catch((err) => {
      console.error("Error uploading to S3:", err.message);
    });
}
