const regex =
  /(\d{1,2}:\d{2}\s?(am|pm)?)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s\d{1,2},\s\d{4}\s*\/\s*\d{1,2}/gi;

function cleanTitle(rawTitle) {
  // return rawTitle
  // .replace(/\d{1,2}:\d{2}\s*(am|pm)?\s*.*$/i, '') // Strip trailing metadata
  // .replace(/\s{2,}/g, ' ')
  // .replace(regex, '')
  // .trim();

  const parts = rawTitle.split(
    /(\d{1,2}:\d{2}\s?(am|pm)|[A-Za-z]+\s\d{1,2},\s\d{4})/,
  );
  return parts[0].trim();
}

module.exports = cleanTitle;
