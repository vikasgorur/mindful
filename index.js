const fs = require('fs');
const path = require('path');

const Mustache = require('mustache');
const Nightmare = require('nightmare');

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
 * Generate an image for the quote and return it as a Buffer.
 */
function imageForQuote(text) {
  nightmare = Nightmare();

  nightmare
    .viewport(1280, 640)
    .goto(urlForQuote(text))
    .screenshot('mindful.png')
    .end()
    .run(function() {
  });
}

let quotes;

function loadQuotes() {
  if (!quotes) {
    let content = fs.readFileSync(path.join(__dirname, 'quotes.txt'), 'utf8');
    quotes = content.split('\n--\n');
  }
}

/**
 * Read the quotes.txt file and return a random quote from it.
 */
function randomQuote() {
  loadQuotes();
  
  let i = Math.floor(Math.random() * (quotes.length));
  return quotes[i];
}