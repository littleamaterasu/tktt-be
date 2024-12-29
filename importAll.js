const fs = require('fs');
const path = require('path');
const { Client } = require('@elastic/elasticsearch');

// Kết nối tới Elasticsearch
const client = new Client({
    node: 'http://localhost:9200'
});

// Tên chỉ mục
const INDEX_NAME = 'it4863-news';

// Hàm đọc tất cả các file JSON trong thư mục
const readJSONFiles = (directory) => {
    try {
        const files = ['./articles.json', './data.json', './processed_data.json']
        const jsonData = [];

        files.forEach((file) => {
            const filePath = path.join(directory, file);
            if (path.extname(file) === '.json') {
                const data = fs.readFileSync(filePath, 'utf8');
                jsonData.push(...JSON.parse(data)); // Giả định mỗi file JSON là một mảng
            }
        });

        return jsonData;
    } catch (error) {
        console.error('Error reading JSON files:', error);
        process.exit(1);
    }
};

// Hàm chuẩn bị payload cho bulk
const prepareBulkPayload = (indexName, data) => {
    const bulkPayload = [];
    data.forEach((doc, index) => {
        // Gộp trường content và title thành content-title
        const contentTitle = `${doc.content} ${doc.title}`;
        doc['content-title'] = contentTitle; // Thêm trường content-title vào document

        bulkPayload.push({ index: { _index: indexName, _id: doc.id || index + 1 } });
        bulkPayload.push(doc);
    });
    return bulkPayload;
};

// Import dữ liệu vào Elasticsearch
const importData = async (directory) => {
    try {
        // Đọc tất cả các file JSON
        const data = readJSONFiles(directory);

        if (data.length === 0) {
            console.log('No data found to import.');
            return;
        }

        // Chuẩn bị payload
        const bulkPayload = prepareBulkPayload(INDEX_NAME, data);

        // Gửi payload tới Elasticsearch
        const response = await client.bulk({ body: bulkPayload });

        if (response.errors) {
            console.error('Errors occurred while importing data:');
            response.items.forEach((item) => {
                if (item.index && item.index.error) {
                    console.error(`Error for document ID ${item.index._id}:`, item.index.error);
                }
            });
        } else {
            console.log(`Successfully indexed ${data.length} documents.`);
        }
    } catch (error) {
        console.error('Error while importing data:', error);
    }
};

// Thực thi import cho thư mục ./data
importData('./data');
