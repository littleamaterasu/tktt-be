const puppeteer = require('puppeteer');
const fs = require('fs');

const topics = [
    'chinh-tri', 'thoi-su', 'the-gioi', 'kinh-te', 'doi-song', 'suc-khoe',
    'gioi-tre', 'giao-duc', 'du-lich', 'van-hoa', 'giai-tri', 'the-thao',
    'cong-nghe', 'xe', 'video', 'tieu-dung', 'thoi-trang-tre',
];

const filePath = 'articles.json'; // Define the path to the articles file

// Hàm đọc số lượng bài viết trong file
const readArticleCount = () => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const articles = JSON.parse(data);
        return articles.length;
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Nếu file không tồn tại, trả về 0
            return 0;
        } else {
            console.error('Lỗi khi đọc file:', err);
            return 0;
        }
    }
};

// Hàm lưu bài viết vào file JSON
const saveToJsonFile = (article) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
        let articles = [];
        if (err && err.code === 'ENOENT') {
            // Nếu file không tồn tại, tạo mảng mới
            articles = [];
        } else if (data) {
            // Chuyển dữ liệu JSON thành mảng
            articles = JSON.parse(data);
        }

        // Thêm bài viết mới vào mảng
        articles.push(article);

        // Ghi lại vào file
        fs.writeFile(filePath, JSON.stringify(articles, null, 2), 'utf8', (writeErr) => {
            if (writeErr) {
                console.error(`Lỗi khi ghi vào file: ${writeErr}`);
            } else {
                console.log(`Đã lưu bài viết vào file JSON: ${article.link}`);
            }
        });
    });
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
                const articleCount = readArticleCount();

                // Nếu số lượng bài viết đã đủ 1000, dừng lại
                if (articleCount >= 1000) {
                    console.log('Đã thu thập đủ 1000 bài viết.');
                    return;
                }

                const details = await fetchArticleDetails(page, fullLink);
                const fullArticle = {
                    link: article.link,
                    title: article.title,
                    content: article.description + ' - ' + details.articleText
                };

                // Lưu vào file JSON
                saveToJsonFile(fullArticle);
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
