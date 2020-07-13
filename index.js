const fs = require('fs');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

const url =
  'https://sfbay.craigslist.org/search/apa?search_distance=10&postal=94563&availabilityMode=0&pets_dog=1&housing_type=6&sale_date=all+dates';

const selectors = {
  title: '.result-title',
  postDate: '.result-date',
  price: '.result-price',
  location: '.result-hood',
  infoRow: '.result-info',
};

const output = (parsed) => {
  fs.writeFileSync('output.json', JSON.stringify(parsed, null, 2), 'utf8');
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

const run = async () => {
  const response = await fetch(url);
  const text = await response.text();
  const $ = cheerio.load(text);
  const $results = $(selectors.infoRow);
  const parsed = $results.map((i, el) => parseResult($(el))).toArray();
  const filtered = parsed.filter((result) => {
    const now = Date.now();
    const milliOneDay = 1000 * 60 * 60 * 24;
    const threshold = now - milliOneDay;
    const postTimestamp = new Date(result.date).getTime();
    return postTimestamp > threshold;
  });
  output(filtered);
};

run();
