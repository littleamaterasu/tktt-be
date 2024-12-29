const fs = require('fs');

const filePath = 'articles.json'; // Path to the file

const readArticleCount = () => {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Lỗi khi đọc file: ${err}`);
            return;
        }

        try {
            const articles = JSON.parse(data);
            console.log(`Số lượng bài viết hiện tại: ${articles.length}`);
        } catch (parseError) {
            console.error(`Lỗi khi phân tích JSON: ${parseError}`);
        }
    });
};

// Đọc số lượng bài viết mỗi giây
setInterval(readArticleCount, 1000);
