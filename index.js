const fs = require('fs');
const path = require('path');

const log = require('simple-node-logger').createSimpleLogger();
const Mustache = require('mustache');
const Promise = require('bluebird');
const Nightmare = require('nightmare');
const sqlite3 = require('sqlite3').verbose();
const Twitter = require('twitter');

/**
 * Return the quote template as a string.
 */
function quoteTemplate() {
  return fs.readFileSync(path.join(__dirname, 'quote.mustache'), 'utf8');
}

/**
 * Apply the quote template with the given text and write to a local file,
 * returning its file:/// url.
 */
function urlForQuote(text) {
  let html = Mustache.render(quoteTemplate(), { text });
  let htmlPath = path.join(__dirname, 'quote.html');

  fs.writeFileSync(htmlPath, html);

  return `file://${htmlPath}`;
}

/**
 * Generate an image for the quote and return it as a Promise<Buffer>.
 */
function imageForQuote(text) {
  nightmare = Nightmare();

  return nightmare
    .viewport(1280, 640)
    .goto(urlForQuote(text))
    .wait(1000)
    .screenshot()
    .end();
}

let quotes;

function loadQuotes() {
  if (!quotes) {
    let content = fs.readFileSync(path.join(__dirname, 'quotes.txt'), 'utf8');
    quotes = content.split('\n--\n');

    log.info(`Loaded ${quotes.length} quotes from quotes.txt`);
  }
}

/**
 * Return a random quote.
 */
function randomQuote() {
  loadQuotes();

  let i = Math.floor(Math.random() * (quotes.length));
  return quotes[i];
}


let client;

function initClient() {
  if (!client) {
    const secrets = require('./secrets');

    client = new Twitter({
      consumer_key: secrets.consumer_key,
      consumer_secret: secrets.consumer_secret,
      access_token_key: secrets.access_token_key,
      access_token_secret: secrets.access_token_secret
    });
  }
}

/**
 * Twitter media upload code taken from:
 * https://github.com/desmondmorris/node-twitter/tree/master/examples#media
 */

/**
 * (Utility function) Send a POST request to the Twitter API
 * @param String endpoint  e.g. 'statuses/upload'
 * @param Object params    Params object to send
 * @return Promise         Rejects if response is error
 */
function post(endpoint, params) {
  return new Promise((resolve, reject) => {
    client.post(endpoint, params, (error, data, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Step 1 of 3: Initialize a media upload
 * @return Promise resolving to String mediaId
 */
function initUpload(size, type) {
  return post('media/upload', {
    command    : 'INIT',
    total_bytes: size,
    media_type : type,
  }).then(data => data.media_id_string);
}

/**
 * Step 2 of 3: Append file chunk
 * @param String mediaId    Reference to media object being uploaded
 * @return Promise resolving to String mediaId (for chaining)
 */
function appendUpload(mediaData) {
  return function(mediaId) {
    return post('media/upload', {
      command      : 'APPEND',
      media_id     : mediaId,
      media        : mediaData,
      segment_index: 0
    }).then(data => mediaId);
  }
}

/**
 * Step 3 of 3: Finalize upload
 * @param String mediaId   Reference to media
 * @return Promise resolving to mediaId (for chaining)
 */
function finalizeUpload(mediaId) {
  return post('media/upload', {
    command : 'FINALIZE',
    media_id: mediaId
  }).then(data => mediaId);
}

/**
 * Tweet a quote.
 */
function tweet(text) {
  return imageForQuote(text).then((image) => {
    initUpload(Buffer.byteLength(image), 'image/png')
      .then(appendUpload(image))
      .then(finalizeUpload)
      .then(mediaId => {
        post('statuses/update', {
          status: '',
          media_ids: mediaId
        })
        .then((tweet) => {
          log.info(`Posted https://twitter.com/botmindful/status/${tweet.id_str}`);
        })
      });
  });
}

/**
 * Promises based interface to the SQLite DB.
 */

/**
 * Run a query.
 */
function dbRun(query) {
  return new Promise((resolve, reject) => {
    let db = new sqlite3.Database('history.db', function(error) {
      if (error) {
        reject(error);
      } else {
        db.run(query, function(error) {
          if (error) {
            reject(error);
          } else {
            db.close();
            resolve();
          }
        });
      }
    });
  });
}

/**
 * Run a query and return all result rows.
 */
function dbAll(query) {
  return new Promise((resolve, reject) => {
    let db = new sqlite3.Database('history.db', function(error) {
      if (error) {
        reject(error);
      } else {
        db.all(query, function(error, rows) {
          if (error) {
            reject(error);
          } else {
            db.close();
            resolve(rows);
          }
        });
      }
    });
  });
}

/**
 * Store the tweet in the DB with a timestamp.
 */
function persistTweet(text) {
  return dbRun(`INSERT INTO tweets VALUES ('${text}', datetime('now'));`);
}

/**
 * Return true if the given text has been tweeted in the last 7 days.
 */
function recentlyTweeted(text) {
  return dbAll(`SELECT text FROM tweets WHERE date > datetime('now', '-7 days');`).then((rows) => {
    for (let row of rows) {
      if (row['text'] === text) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Return a tweet randomly that hasn't been tweeted recently.
 */

const MAX_ATTEMPTS = 100;

function suitableQuote(attempt = 0) {
  let quote = randomQuote();

  return recentlyTweeted(quote).then((yes) => {
    if (yes && attempt < MAX_ATTEMPTS) {
      return suitableQuote(attempt + 1);
    } else {
      log.info(`Selected quote: '${quote}'`);
      return quote;
    }

    log.info(`Maximum attempts exhausted.`);
  })
}

if (process.argv.length != 3) {
  console.error('usage: node index.js [save|tweet]');
  process.exit(1);
}

if (process.argv[2] === 'save') {
  let quote = randomQuote();

  imageForQuote(quote).then((image) => {
    fs.writeFileSync('tweet.png', image);
  });

} else if (process.argv[2] === 'tweet') {
  initClient();

  suitableQuote().then((quote) => {
    imageForQuote(quote).then((image) => {
      tweet(quote).then(() => {
        persistTweet(quote);
      });
    });
  });
}
