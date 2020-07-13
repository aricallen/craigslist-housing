const fs = require('fs');
const cheerio = require('cheerio');
const { uniqBy } = require('lodash');
const axios = require('axios');
const path = require('path');

const url =
  'https://sfbay.craigslist.org/search/apa?search_distance=10&postal=94563&max_price=5000&availabilityMode=0&pets_dog=1&housing_type=6&sale_date=all+dates';

const selectors = {
  title: '.result-title',
  postDate: '.result-date',
  price: '.result-price',
  location: '.result-hood',
  infoRow: '.result-info',
};

const SLACK_WEBHOOK_URL =
  'https://hooks.slack.com/services/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';
const DB_FILE_PATH = path.join(__dirname, 'data/db.json');
const INTERVAL = 1000 * 60 * 5; // 5 mins

if (fs.existsSync(DB_FILE_PATH) === false) {
  fs.mkdirSync('data');
  fs.writeFileSync(DB_FILE_PATH, '', 'utf8');
}

const getDb = () => {
  const dbStr = fs.readFileSync(DB_FILE_PATH, 'utf8');
  try {
    const db = JSON.parse(dbStr);
    return db;
  } catch (err) {
    return [];
  }
};

const parseResult = ($result) => {
  const title = $result.find(selectors.title).text();
  const href = $result.find(selectors.title).attr('href');
  const date = $result.find(selectors.postDate).attr('datetime');
  const price = $result.find(selectors.price).text();
  const location = $result
    .find(selectors.location)
    .text()
    .trim()
    .replace(/^\(|\)$/g, '');
  return { title, date, price, location: location || 'Not specified', href };
};

const updateDb = (posts) => {
  const prevDb = getDb();
  console.log('getting prev db...', JSON.stringify(posts.map((p) => p.title)));
  const uniquePosts = uniqBy([...prevDb, ...posts], (p) => p.title);
  fs.writeFileSync(DB_FILE_PATH, JSON.stringify(uniquePosts, null, 2), 'utf8');
};

const getNewPosts = (fetchedPosts) => {
  const db = getDb();
  const prevTitles = db.map((post) => post.title);
  return fetchedPosts.filter((post) => {
    return prevTitles.includes(post.title) === false;
  });
};

const notifyAboutNewPosts = (posts) => {
  // send to slack each href
  const hrefs = posts.map((post) => post.href);
  const _notify = async (index = 0) => {
    const href = hrefs[index];
    if (href) {
      const text = `@celeste @aric ${href}`;
      await axios.post(SLACK_WEBHOOK_URL, { text, unfurl_links: true });
      console.log('notifying about: ', href);
      setTimeout(() => {
        _notify(index + 1);
      }, 5000);
    }
  };
  _notify();
};

const run = async () => {
  const response = await axios.get(url);
  const text = await response.data;
  const $ = cheerio.load(text);
  const $results = $(selectors.infoRow);
  const parsed = $results.map((i, el) => parseResult($(el))).toArray();
  const now = Date.now();
  const lastDayPosts = parsed.filter((result) => {
    const milliOneDay = 1000 * 60 * 60 * 24;
    const threshold = now - milliOneDay;
    const postTimestamp = new Date(result.date).getTime();
    return postTimestamp > threshold;
  });
  const newPosts = getNewPosts(lastDayPosts);
  updateDb([...lastDayPosts, ...newPosts]);
  notifyAboutNewPosts(newPosts);
  console.log(`added ${newPosts.length} posts`);
  console.log('last updated: ', new Date(now).toISOString());
};

run();
setInterval(run, INTERVAL);
