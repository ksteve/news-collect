const util = require('util');
const config = require("./config.json");
const express = require("express");
const NewsApi = require("newsapi");
const newsapi = new NewsApi("news_key");
//require('dotenv').config()

var credentials = {
    accessKeyId: 'access_key',//process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: 'secret',//process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-west-2'
}
const dynasty = require('dynasty')(credentials);
let newstbl = dynasty.table('news'); 

const PORT = process.env.PORT || 8080;
const app = express();

app.get('/', (req, res) => {
    res.send('running!');
});

app.get('/run', (req, res) => {
    run();
    res.send("done");
});

const NLUV1 = require("watson-developer-cloud/natural-language-understanding/v1.js");
const nlu = new NLUV1({
    'username': '5f6b8a01-3714-4fad-a78f-8a057310f8f2',
    'password': `${config.watson_pass}`,
    'version': '2018-03-16'
});
const analyze = util.promisify(nlu.analyze);

function insertDynasty(table ,data){
    //console.log(Object.keys(data));
    return table.insert(data)
}

function getTopHeadlines() {
    return newsapi.v2.topHeadlines({
        language: 'en'
        , sources: 'google-news,cnn,the-washington-post,vice-news,bbc-news,techcrunch,techradar',
        pageSize: 10
    });
}

// function getHtml(url) {
//     return axios(url);
// }

// function getExtractedContent(html) {
//     return extractor(html);
// }

async function getNluData(entries) {
    return await Promise.all(entries.map(async (x) => {
        try {
            let params = {
                'url': x.url,
                'features': {
                    'entities': { 'sentiment': true, 'limit': 10 },
                    'keywords': { 'sentiment': true, 'limit': 10 },
                    'concepts': { 'sentiment': true, 'limit': 10 }
                }
            }

            return await new Promise((resolve, reject) => {
                nlu.analyze(params, function (err, response) {
                    if (err){
                        reject(err)
                    }
                    
                    if (response){
                        x.entities = response.entities
                        x.keywords = response.keywords
                        x.concepts = response.concepts
                        resolve(x);
                    }
                });
            });
        } catch (error) {
            console.log(error);
        }
    }));
}

async function run() {
    console.log("running");
    let entries = [];

    try {

        //get top headlines from newsapi
        let headlines = await getTopHeadlines();

        //get info from headlines
        entries = headlines.articles.map(x => {
            return {
                date: new Date(x.publishedAt).toISOString(),
                url: x.url,
                title: x.title,
                description: x.description,
                source: x.source.name
            }
        });

        // entries = entries.filter(x => {
        //     return x;
        // });

        //get html page from headline urls
        // entries = await Promise.all(entries.map(async function (x) {
        //     let html = await getHtml(x.url);
        //     let data = await getExtractedContent(html.data);
        //     if (data.text && data.text != "") {
        //         x.text = data.text;
        //         return x;
        //     }
        // }));

        entries = entries.filter(x => x);

        entries = await getNluData(entries);

        //insert data into sqlite db
        if (entries.length > 0) {
            entries.forEach(async (x) => {
                try {
                    await insertDynasty(newstbl, x)    
                } catch (error) {
                    console.log("error");
                    console.log(error);
                }                
            });
        }
        console.log('done');

    } catch (error) {
        console.log(error);
    }

   // process.exit();
}

const server = app.listen(PORT, () => {
    const host = server.address().address;
    const port = server.address().port;  
    console.log(`Example app listening at http://${host}:${port}`);
});
  
