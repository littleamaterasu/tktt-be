const axios = require('axios');
const cheerio = require('cheerio');
const { Client } = require("@elastic/elasticsearch");

// Cấu hình Elasticsearch
const elasticsearchUrl = 'http://localhost:9200';
const elasticsearchIndexName = 'nhom-2';

const client = new Client({
    node: elasticsearchUrl
});

const topics = [
    'thoi-su', 'goc-nhin', 'the-gioi', 'kinh-doanh', 'chung-khoan', 'dat-dong-san',
    'khoa-hoc', 'giai-tri', 'the-thao', 'giao-duc', 'suc-khoe', 'phap-luat',
    'doi-song', 'du-lich', 'so-hoa', 'oto-xe-may', 'y-kien', 'tam-su'
];

const generateUrls = (topic) => {
    return [
        ...Array.from({ length: 19 }, (_, i) => `https://vnexpress.net/${topic}-p${20 - i}`),
        `https://vnexpress.net/${topic}`
    ];
};

// Tổng hợp tất cả URL từ danh sách chủ đề
const urls = topics.flatMap(generateUrls);

console.log(urls);

// Hàm kiểm tra trùng lặp bằng Elasticsearch
const isDuplicate = async (link) => {
    // const response = await client.search({
    //     index: elasticsearchIndexName,
    //     body: {
    //         query: {
    //             match: { link }
    //         }
    //     }
    // });
    // return response.hits.total.value > 0;
    return false;
};

const saveToElasticsearch = async (article) => {
    try {
        await client.index({
            index: elasticsearchIndexName,
            document: article
        });
        console.log(`Đã lưu bài viết vào Elasticsearch: ${article.link}`);
    } catch (error) {
        console.error(`Lỗi khi lưu vào Elasticsearch: ${error}`);
    }
};

// Hàm lấy chi tiết bài viết
const fetchArticleDetails = async (link) => {
    try {
        const response = await axios.get(link);
        const $ = cheerio.load(response.data);

        // mốc thời gian bài báo
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
            console.log('link:', link);
            const title = $(element).find('h3.title-news a').text().trim() || $(element).find('h1.title-news a').text().trim();
            console.log('title:', title)
            const description = $(element).find('p.description a').text().trim();
            console.log('description:', description.slice(0, 20));
            const srcset = $(element).find('source[srcset]').first().attr('srcset') || $(element).find('source[data-srcset]').first().attr('data-srcset') || ' 1x';
            const imageUrl = srcset.split(' 1x')[0];
            console.log('image URL:', srcset);

            if (title && link && description && imageUrl) {
                const fullLink = new URL(link, url).href;
                if (await isDuplicate(fullLink)) {
                    console.log(`Bỏ qua bài viết đã tồn tại: ${fullLink}`);
                    continue;
                }

                const { timeAgo, keywords, articleText } = await fetchArticleDetails(fullLink);
                console.log("timeStamp:", timeAgo);
                console.log('keywords:', keywords);
                console.log('content:', articleText.slice(0, 20))
                const article = {
                    title,
                    link: fullLink,
                    description,
                    timeStamp: timeAgo,
                    keywords,
                    content: articleText,
                    imageUrl,
                };
                // Lưu vào Elasticsearch
                // await saveToElasticsearch(article);

                console.log(`Đã crawl: ${fullLink}`);
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
        await sleep(1000); // Dừng 5 giây giữa mỗi URL
    }
    console.log('Hoàn tất crawl dữ liệu.');
};

// Sử dụng setInterval để chạy định kỳ
console.log(`Chương trình sẽ chạy định kỳ sau mỗi ${intervalMinutes} phút.`);
main(); // Chạy lần đầu tiên
setInterval(main, intervalMilliseconds);