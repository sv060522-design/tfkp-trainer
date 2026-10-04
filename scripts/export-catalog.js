const {loadCatalog} = require('./load-catalog');
process.stdout.write(JSON.stringify(loadCatalog().tasks));
