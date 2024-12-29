const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Import cors
const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');
const e = require('express');

require('dotenv').config();
// Cấu hình Elasticsearch
const elasticsearchUrl = process.env.ES_URL;
const elasticsearchIndexName = 'it4863-animals';
console.log(elasticsearchUrl, elasticsearchIndexName)

const client = new Client({
    node: elasticsearchUrl
});

const app = express();
const port = 3000;

const indices = ['it4863-news', 'it4863-animals', 'it4863-plants', 'it4863-songs', 'it4863-mangas', 'it4863-laws', 'it4863-proverbs', 'it4863-healths']
const all = 'it4863-all';
const probability = {
    'it4863-news': 3000.0 / 9899,
    'it4863-animals': 998.0 / 9899,
    'it4863-plants': 1000.0 / 9899,
    'it4863-songs': 1000.0 / 9899,
    'it4863-mangas': 1000.0 / 9899,
    'it4863-laws': 1000.0 / 9899,
    'it4863-proverbs': 902.0 / 9899,
    'it4863-health': 999.0 / 9899
}

const dictionary = {};
indices.forEach(index => {
    dictionary[index] = {};
})
const vocab = {};
indices.forEach(index => {
    vocab[index] = 0;
})
let vocabCount = 0;

const getDictionary = async (indexName) => {
    try {
        const response = await client.search({
            index: indexName,
            body: {
                size: 0,
                aggs: {
                    terms_content: {
                        terms: {
                            field: "content-title",
                            size: 65536,
                        }
                    }
                }
            }
        });

        const terms = response.aggregations.terms_content.buckets;
        return terms.map(term => ({
            name: term.key,
            count: term.doc_count
        }));

    } catch (error) {
        console.error(`Error getting dictionary for index ${indexName}:`, error);
        return [];
    }
}

const makeDictionary = async () => {
    // Iterate over all indices
    for (const element of indices) {
        // Get dictionary for each index
        const indexDict = await getDictionary(element);

        // Initialize the index in the dictionary if not already initialized
        if (!dictionary[element]) {
            dictionary[element] = {};
        }

        // Populate the dictionary with the terms and counts
        indexDict.forEach(token => {
            vocab[element] += token.count;
            dictionary[element][token.name] = token.count;
        });
    }

    const totalToken = await getDictionary(all);
    vocabCount = totalToken.length;
}

// Run the makeDictionary function
makeDictionary();

// Middleware để xử lý JSON
app.use(bodyParser.json());

// Sử dụng CORS để cho phép truy cập từ tất cả các domain (hoặc có thể chỉ định domain cụ thể)
app.use(cors());  // Bật CORS cho tất cả các nguồn

// API tìm kiếm bài viết
app.post('/search', async (req, res) => {
    const { query, fields } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        // Phân tích từ khóa bằng vi_analyzer
        const analyzeResponse = await client.indices.analyze({
            index: elasticsearchIndexName,
            body: {
                text: query,
                analyzer: 'my_vi_analyzer'  // Sử dụng vi_analyzer đã cấu hình
            }
        });

        const analyzedKeywords = analyzeResponse.tokens.map(token => token.token);

        // Đếm số lần xuất hiện của mỗi token
        const tokenCount = analyzedKeywords.reduce((countMap, token) => {
            countMap[token] = (countMap[token] || 0) + 1;
            return countMap;
        }, {});

        let index = 'it4863';
        let point = 0.0;

        indices.forEach(element => {
            let currentPoint = probability[element];
            analyzedKeywords.forEach(keyword => {
                currentPoint *= Math.pow((1.0 + dictionary[element][keyword] || 0) / (vocabCount + vocab[element]), tokenCount[keyword]);
            })

            if (point < currentPoint) {
                index = element;
                point = currentPoint;
            }
        })

        console.log(index)

        // Tiến hành tìm kiếm
        const response = await client.search({
            index: index,
            body: {
                query: {
                    bool: {
                        should: [
                            {
                                multi_match: {
                                    query,
                                    fields: fields || ['title^3', 'content'], // Trọng số: tiêu đề ưu tiên cao hơn với ^3
                                    fuzziness: 'AUTO', // Cho phép tìm kiếm gần đúng
                                }
                            },
                            {
                                match_phrase: {
                                    content: query // Đảm bảo toàn bộ cụm từ xuất hiện nguyên vẹn trong content
                                }
                            }
                        ],
                        minimum_should_match: 1 // Yêu cầu ít nhất hai điều kiện từ trong truy vấn phải khớp
                    }
                },
                size: 10 // Số lượng kết quả trả về tối đa
            }
        });


        const results = response.hits.hits.map(hit => ({
            id: hit._id,
            score: hit._score,
            ...hit._source
        }));

        // Trả về kết quả và phân tích từ khóa
        res.json({
            analyzedKeywords,
            results // Các từ khóa đã phân tích từ query
        });
    } catch (error) {
        console.error('Lỗi khi tìm kiếm:', error);
        res.status(500).json({ error: 'Có lỗi xảy ra trong quá trình tìm kiếm' });
    }
});

// API fetch bài viết từ article x đến article y
app.post('/fetch-range', async (req, res) => {

    const { start, end } = req.body;

    if (start == null || end == null) {
        return res.status(400).json({ error: 'Start and end are required' });
    }

    try {
        const response = await client.search({
            index: elasticsearchIndexName,
            body: {
                query: {
                    match_all: {}  // Truy vấn tất cả bài viết
                },
                from: start,
                size: end - start + 1, // Đảm bảo lấy đúng số lượng bài viết trong khoảng
            }
        });

        const results = response.hits.hits.map(hit => ({
            id: hit._id,
            score: hit._score,
            ...hit._source
        }));

        res.json({ results });
    } catch (error) {
        console.error('Lỗi khi lấy bài viết theo range:', error);
        res.status(500).json({ error: 'Có lỗi xảy ra khi lấy bài viết theo range' });
    }
});

// Bắt đầu máy chủ
app.listen(port, () => {
    console.log(`API server is running at http://localhost:${port}`);
});
