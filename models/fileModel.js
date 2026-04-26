module.exports = function createFileData(title, url) {
  return {
    title,
    url,
    createdAt: Date.now()
  };
};