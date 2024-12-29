const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
require('dotenv').config();

// Kết nối tới Elasticsearch
const client = new Client({
    node: 'http://localhost:9200'
});

// Tên chỉ mục
const INDEX_NAME = process.env.INDEX_NAME;

// Hàm đọc dữ liệu từ file JSON
const readDataFromFile = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading or parsing file:', error);
        process.exit(1);
    }
};

// Hàm chuẩn bị payload cho bulk
const prepareBulkPayload = (indexName, data) => {
    const bulkPayload = [];
    data.forEach((doc) => {
        // Gộp trường content và title thành content-title
        const contentTitle = `${doc.content} ${doc.title}`;
        doc['content-title'] = contentTitle; // Thêm trường content-title vào document

        bulkPayload.push({ index: { _index: indexName, _id: doc.id } });
        bulkPayload.push(doc);
    });
    return bulkPayload;
};

// Import dữ liệu vào Elasticsearch
const importData = async (filePath) => {
    try {
        // Đọc dữ liệu từ file JSON
        const data = readDataFromFile(filePath);

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

// Thực thi import với file abc.json
importData(process.env.FILE_PATH);
