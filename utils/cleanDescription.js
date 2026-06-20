function cleanDescription(inputText) {
  // Remove English email subscription line
  let cleanedText = inputText.replace(
    /Enter your email to get our daily news in your inbox\.?/gi,
    "",
  );

  // Remove extra newlines and whitespace
  // Remove any remaining English words or symbols (optional)
  // This regex matches common English words, adjust as needed
  cleanedText = cleanedText.replace(/[a-zA-Z0-9_@\.]+/g, "");

  // Final cleanup: Remove multiple spaces
  // cleanedText = cleanedText.replace(/\s+/g, ' ');

  const cleanText = cleanedText?.split(" ").slice(0, 100).join(" ") + "...";

  return cleanText;
}

module.exports = cleanDescription;
