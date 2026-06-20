exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      source: "Prameya",
      message: "Prameya Lambda executed successfully",
    }),
  };
};
