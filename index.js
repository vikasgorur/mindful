const path = require('path');
const Nightmare = require('nightmare');

nightmare = Nightmare();

nightmare
  .goto(`file://${path.join(__dirname, 'quote.html')}`)
  .screenshot('mindful.png')
  .end()
  .run(function() {
  });
   
