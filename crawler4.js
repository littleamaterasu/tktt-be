const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs'); // Import fs module

const topics = [
    'thoi-su', 'goc-nhin', 'the-gioi', 'kinh-doanh', 'chung-khoan', 'dat-dong-san',
    'khoa-hoc', 'giai-tri', 'the-thao', 'giao-duc', 'suc-khoe', 'phap-luat',
    'doi-song', 'du-lich', 'so-hoa', 'oto-xe-may', 'y-kien', 'tam-su'
];

const generateUrls = (topic) => {
    return [
        ...Array.from({ length: 4 }, (_, i) => `https://vnexpress.net/${topic}-p${5 - i}`),
        `https://vnexpress.net/${topic}`
    ];
};

// Tổng hợp tất cả URL từ danh sách chủ đề
const urls = topics.flatMap(generateUrls);

console.log(urls);

let articleCount = 0; // Counter to track the number of articles crawled

// Hàm lưu bài viết vào file JSON
const saveToJsonFile = (article) => {
    const filePath = 'articles.json'; // Define file path

    // Đọc dữ liệu từ file nếu đã tồn tại
    fs.readFile(filePath, 'utf8', (err, data) => {
        let articles = [];
        if (err && err.code === 'ENOENT') {
            // File không tồn tại, tạo file mới
            articles = [];
        } else if (data) {
            // Chuyển đổi dữ liệu JSON thành mảng
            articles = JSON.parse(data);
        }

        // Thêm bài viết mới vào mảng
        articles.push(article);

        // Ghi lại dữ liệu vào file
        fs.writeFile(filePath, JSON.stringify(articles, null, 2), 'utf8', (writeErr) => {
            if (writeErr) {
                console.error(`Lỗi khi ghi vào file: ${writeErr}`);
            } else {
                console.log(`Đã lưu bài viết vào file JSON: ${article.link}`);
            }
        });
    });
};

// Hàm lấy chi tiết bài viết
const fetchArticleDetails = async (link) => {
    try {
        const response = await axios.get(link);
        const $ = cheerio.load(response.data);

        const timeAgo = $('span.date').text().trim() || 'Không có thông tin';
        const rawKeywords = $('meta[name="news_keywords"]').attr('content') || '';
        const keywords = rawKeywords.split(',').map(keyword => keyword.trim());

        let content = [];
        $('article.fck_detail p.Normal').each((index, element) => {
            const paragraphText = $(element).text().trim();
            if (paragraphText) {
                content.push(paragraphText);
            }
        });

        const articleText = content.join('\n\n');
        return { timeAgo, keywords, articleText };
    } catch (error) {
        console.error(`Lỗi khi lấy chi tiết bài viết từ ${link}: ${error}`);
        return { timeAgo: 'Không có thông tin', keywords: '', articleText: '', imageUrl: '' };
    }
};

// Hàm lấy danh sách bài viết
const fetchDataFromUrl = async (url) => {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const articleElements = $('article.item-news');
        for (let index = 0; index < articleElements.length; index++) {
            const element = articleElements[index];
            const link = $(element).find('a').attr('href');
            const title = $(element).find('h3.title-news a').text().trim() || $(element).find('h1.title-news a').text().trim();
            const description = $(element).find('p.description a').text().trim();
            const srcset = $(element).find('source[srcset]').first().attr('srcset') || $(element).find('source[data-srcset]').first().attr('data-srcset') || '1x';
            const imageUrl = srcset.split(' 1x')[0];

            if (title && link && description && imageUrl) {
                const fullLink = new URL(link, url).href;
                const { timeAgo, keywords, articleText } = await fetchArticleDetails(fullLink);

                const article = {
                    title,
                    link: fullLink,
                    content: description + ' - ' + articleText,
                };

                // Lưu vào file JSON
                saveToJsonFile(article);
                articleCount++; // Increment the article count
                console.log(`Đã crawl: ${fullLink}`);

                // Stop crawling if we have 1000 articles
                if (articleCount >= 1000) {
                    console.log('Đã thu thập 1000 bài viết, dừng chương trình.');
                    return;
                }
            }
            await sleep(100);
        }
    } catch (error) {
        console.error(`Lỗi khi lấy dữ liệu từ ${url}: ${error}`);
    }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Chương trình chính
const intervalMinutes = 120; // Khoảng thời gian chạy lại (phút)
const intervalMilliseconds = intervalMinutes * 60 * 1000; // Chuyển đổi sang mili-giây

const main = async () => {
    console.log('Bắt đầu crawl dữ liệu...');
    for (let i = 0; i < urls.length; i++) {
        console.log(`Đang crawl URL: ${urls[i]}`);
        await fetchDataFromUrl(urls[i]);
        await sleep(1000); // Dừng 1 giây giữa mỗi URL

        // Nếu đã thu thập đủ 1000 bài viết, dừng chương trình
        if (articleCount >= 1000) {
            console.log('Đã thu thập 1000 bài viết, kết thúc quá trình.');
            break;
        }
    }
    console.log('Hoàn tất crawl dữ liệu.');
};

// Sử dụng setInterval để chạy định kỳ
console.log(`Chương trình sẽ chạy định kỳ sau mỗi ${intervalMinutes} phút.`);
main(); // Chạy lần đầu tiên
setInterval(main, intervalMilliseconds);
