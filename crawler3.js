const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const baseUrl = 'https://www.brainyquote.com';

// Hàm delay để tạo độ trễ giữa các lần truy cập URL
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Lấy số trang của tác giả
const fetchAuthorPages = async (authorUrl) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');
        await page.goto(authorUrl, { waitUntil: 'networkidle2' });

        const html = await page.content();
        const $ = cheerio.load(html);

        const pageLinks = $('.page-item a');

        // Ensure there are enough page links
        if (pageLinks.length < 3) {
            console.log('Not enough page links found, returning 1 page as fallback.');
            await browser.close();
            return 1;
        }

        const secondPage = parseInt($(pageLinks[1]).text().trim()); // Lấy số từ thẻ thứ 2
        const secondToLastPage = parseInt($(pageLinks[pageLinks.length - 2]).text().trim()); // Lấy số từ thẻ áp chót

        // Ensure the values are valid numbers
        if (isNaN(secondPage) || isNaN(secondToLastPage)) {
            console.log('Invalid page numbers, returning 1 page as fallback.');
            await browser.close();
            return 1;
        }

        // Tính tổng số trang
        const pageCount = secondToLastPage - secondPage + 1;

        await browser.close();

        return pageCount;
    } catch (error) {
        console.error('Error fetching author pages:', error.message);
        return 1;  // Nếu có lỗi, trả về 1 trang
    }
};

// Lấy thông tin từ từng link trích dẫn
const fetchQuoteDetails = async (quoteUrl, visitedUrls) => {
    try {
        if (visitedUrls.has(quoteUrl)) {
            console.log('Skipping duplicate quote URL:', quoteUrl);
            return null; // Skip if already visited
        }

        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');
        await page.goto(quoteUrl, { waitUntil: 'networkidle2' });

        const html = await page.content();
        const $ = cheerio.load(html);

        // Lấy các topics
        const topics = [];
        $('a[href^="/topics/"]').each((index, element) => {
            const topic = $(element).text().trim();
            if (topic) {
                topics.push(topic);
            }
        });

        // Lấy nội dung quote
        const quoteText = $('p.b-qt').text().trim();

        // Lấy tác giả
        const author = $('p.bq_fq_a').text().trim();

        console.log(quoteText.slice(0, 10), author, topics);

        visitedUrls.add(quoteUrl); // Add URL to visited set to prevent duplication

        await browser.close();

        return { quoteText, author, topics };

    } catch (error) {
        console.error('Error fetching quote details:', error.message);
        return null;
    }
};

// Lấy các trích dẫn từ các trang tác giả
const fetchQuotesFromAuthorPage = async (authorUrl, pageNumber) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');
        await page.goto(`${authorUrl}_${pageNumber}`, { waitUntil: 'networkidle2' });

        const html = await page.content();
        const $ = cheerio.load(html);

        const quotes = [];
        $('a[href^="/quotes/"]').each((index, element) => {
            const href = $(element).attr('href');
            if (href) {
                quotes.push(baseUrl + href);
            }
        });

        await browser.close();

        return quotes;
    } catch (error) {
        console.error('Error fetching quotes from page:', error.message);
        return [];
    }
};

// Lấy danh sách các tác giả
const fetchAuthors = async (url) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');

        const authors = [];
        const seenNames = new Set(); // A Set to track unique author names

        // Lặp qua các chữ cái a-z để lấy các trang tác giả
        for (let letter = 97; letter <= 97; letter++) {  // ASCII a-z = 97-122
            const letterUrl = `${baseUrl}/authors/${String.fromCharCode(letter)}`;
            console.log(letterUrl);

            await page.goto(letterUrl, { waitUntil: 'networkidle2' });
            const html = await page.content();
            const $ = cheerio.load(html);

            // Lấy thông tin các tác giả từ các thẻ a có href dài hơn 10
            $('a[href^="/authors/"]').each((index, element) => {
                const href = $(element).attr('href');
                const name = $(element).text().trim();  // Corrected .text() method
                if (href && name && href.length > 10 && name.length > 2 && !seenNames.has(name)) {
                    authors.push({ name, href: baseUrl + href });
                    seenNames.add(name); // Add the name to the Set to prevent duplicates
                    console.log(name, href);
                }
            });

            // Thêm độ trễ giữa các lần truy cập URL để tránh bị chặn
            await delay(500);  // Thêm 500ms delay giữa các lần truy cập
        }

        await browser.close();

        return authors;
    } catch (error) {
        console.error('Error fetching authors:', error.message);
        return [];
    }
};

// Lưu trích dẫn vào file JSON theo dạng author_from_to.json
const saveQuoteToFile = (quoteDetails, authorName, from, to) => {
    const fileName = `${authorName.replace(/\s+/g, '_').toLowerCase()}_from_${from}_to_${to}.json`;  // Replace spaces with underscores for the filename
    const filePath = path.join(__dirname, fileName);

    // Đọc dữ liệu hiện tại từ file nếu có
    let existingData = [];
    if (fs.existsSync(filePath)) {
        existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    // Thêm trích dẫn mới vào danh sách
    existingData.push(quoteDetails);

    // Ghi lại dữ liệu vào file
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf-8');
    console.log(`Quote for ${authorName} saved to ${filePath}`);
};

// Main function to scrape quotes for all authors
const main = async () => {
    try {
        // Lưu trữ tất cả các URL đã được xử lý
        const visitedUrls = new Set();

        // Lấy danh sách các tác giả
        const authors = await fetchAuthors(baseUrl);
        console.log(authors);

        for (const author of authors) {
            console.log(`Fetching quotes for author: ${author.name}`);

            // Lấy số trang của tác giả
            const totalPages = await fetchAuthorPages(author.href);

            console.log(`Total pages for ${author.name}: ${totalPages}`);

            let allQuotes = [];

            // Lặp qua tất cả các trang
            for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
                console.log(`Fetching quotes from page ${pageNumber}...`);
                const quotes = await fetchQuotesFromAuthorPage(author.href, pageNumber);
                allQuotes = [...allQuotes, ...quotes];

                // Thêm độ trễ giữa các lần truy cập URL để tránh bị chặn
                await delay(100);  // Thêm 100ms delay giữa các lần truy cập
            }

            console.log(`Found ${allQuotes.length} quotes for ${author.name}`);

            let quotesChunk = [];
            let count = 0;

            // Duyệt qua các link trích dẫn và lấy thông tin chi tiết
            for (const quoteLink of allQuotes) {
                const quoteDetails = await fetchQuoteDetails(quoteLink, visitedUrls);  // Lấy thông tin chi tiết của mỗi trích dẫn
                if (quoteDetails) {
                    quotesChunk.push(quoteDetails);
                    count++;

                    // Lưu từng nhóm 10 trích dẫn
                    if (count % 10 === 0) {
                        const from = count - 9;
                        const to = count;
                        saveQuoteToFile(quotesChunk, author.name, from, to);
                        quotesChunk = [];  // Reset the chunk for the next group of 10
                    }
                }

                // Thêm độ trễ giữa các lần truy cập URL để tránh bị chặn
                await delay(100);  // Thêm 100ms delay giữa các lần truy cập
            }

            // Lưu nhóm còn lại nếu có
            if (quotesChunk.length > 0) {
                const from = count - quotesChunk.length + 1;
                const to = count;
                saveQuoteToFile(quotesChunk, author.name, from, to);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
};

main();
