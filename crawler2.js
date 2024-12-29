const puppeteer = require('puppeteer');
const { Client } = require('@elastic/elasticsearch');

// Cấu hình Elasticsearch
const elasticsearchUrl = 'http://localhost:9200';
const elasticsearchIndexName = 'nhom-2';
const client = new Client({ node: elasticsearchUrl });

const topics = [
    'chinh-tri',
    'thoi-su',
    'the-gioi',
    'kinh-te',
    'doi-song',
    'suc-khoe',
    'gioi-tre',
    'giao-duc',
    'du-lich',
    'van-hoa',
    'giai-tri',
    'the-thao',
    'cong-nghe',
    'xe',
    'video',
    'tieu-dung',
    'thoi-trang-tre',
];

// Kiểm tra trùng lặp bằng Elasticsearch
const isDuplicate = async (link) => {
    const response = await client.search({
        index: elasticsearchIndexName,
        body: {
            query: { match: { link } }
        }
    });
    return response.hits.total.value > 0;
};

// Lưu bài viết vào Elasticsearch
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

// Hàm crawl chi tiết bài viết
const fetchArticleDetails = async (page, link) => {
    try {
        await page.goto(link, { waitUntil: 'networkidle2' });

        const timeAgo = await page.$eval(
            'div[data-role="publishdate"]',
            el => el.textContent.trim()
        ).catch(() => 'Không có thông tin');

        const rawKeywords = await page.$eval(
            'meta[name="news_keywords"]',
            el => el.content
        ).catch(() => '');
        const keywords = rawKeywords.split(',').map(keyword => keyword.trim());

        await page.waitForSelector('div.detail-content.afcbc-body p', { visible: true });

        // Lấy nội dung bài viết
        const articleText = await page.$$eval(
            'div.detail-content.afcbc-body p',
            paragraphs => paragraphs.map(p => p.textContent.trim()).join('\n\n')
        );

        return { timeAgo, keywords, articleText };
    } catch (error) {
        console.error(`Lỗi khi lấy chi tiết bài viết từ ${link}: ${error}`);
        return { timeAgo: 'Không có thông tin', keywords: [], articleText: '' };
    }
};

// Hàm crawl dữ liệu theo URL
const fetchDataFromUrl = async (topic, page) => {
    const url = `https://thanhnien.vn/${topic}.htm`;
    console.log(`Đang crawl topic: ${topic}`);

    await page.goto(url, { waitUntil: 'networkidle2' });

    while (true) {
        try {
            // Lấy danh sách bài viết
            const articles = await page.$$eval(
                'div.box-category-item',
                items => items.map(item => ({
                    title: item.querySelector('div.box-category-content h3.box-title-text a')?.textContent.trim(),
                    link: item.querySelector('a')?.href,
                    description: item.querySelector('div.box-category-content div.item-related a')?.textContent.trim() || [],
                    imageUrl: item.querySelector('img[data-type="avatar"]')?.getAttribute('srcset')?.split(' 1x')[0],
                }))
            );

            for (const article of articles) {
                if (!article.title || !article.link) continue;

                const fullLink = new URL(article.link, url).href;
                if (await isDuplicate(fullLink)) {
                    console.log(`Bỏ qua bài viết đã tồn tại: ${fullLink}`);
                    continue;
                }

                const details = await fetchArticleDetails(page, fullLink);
                const fullArticle = {
                    ...article,
                    link: fullLink,
                    timeStamp: details.timeAgo,
                    keywords: details.keywords,
                    content: details.articleText
                };

                console.log(fullArticle.link);
                console.log(fullArticle.title.slice(0, 10));
                console.log(fullArticle.keywords);
                console.log(fullArticle.description.slice(0, 10));
                console.log(fullArticle.imageUrl);
                console.log(fullArticle.content.slice(0, 10));
                console.log(fullArticle.timeStamp);

                // Lưu vào Elasticsearch
                await saveToElasticsearch(fullArticle);
                console.log(`Đã crawl: ${fullLink}`);
            }

            // Kiểm tra nút "Xem thêm"
            const loadMoreButton = await page.$('.list__center.view-more.list__viewmore');
            if (!loadMoreButton) break;

            const isVisible = await page.evaluate(button => button && button.offsetParent !== null, loadMoreButton);
            if (isVisible) {
                console.log("Nhấn nút 'Xem thêm'...");
                await loadMoreButton.click();
                await page.waitForTimeout(3000); // Đợi tải thêm
            } else {
                console.log("Không còn nút 'Xem thêm'.");
                break;
            }
        } catch (error) {
            console.error(`Lỗi khi crawl topic ${topic}: ${error}`);
            break;
        }
    }
};

// Chương trình chính
const main = async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    for (const topic of topics) {
        await fetchDataFromUrl(topic, page);
        console.log(`Hoàn tất crawl topic: ${topic}`);
    }

    await browser.close();
};

main().catch(console.error);
