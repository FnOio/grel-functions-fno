const fs = require("fs");
const fsp = require("fs/promises");
const { once } = require('events');
const path = require("path");
const dateFormat = require("dateformat");
const ttl_read = require('@graphy/content.ttl.read');
const ttl_write = require('@graphy/content.ttl.write');
const dataset = require('@graphy/memory.dataset.fast');

const currDate = dateFormat(new Date(), "yyyy-mm-dd");

const voidGrel = path.resolve(__dirname, '../../resources/alignment/void-grel.ttl');
const functions = path.resolve(__dirname, '../../resources/alignment/functions.ttl');
const out = path.resolve(__dirname, '../../resources/alignment/output/out.ttl');
const htaccess = path.resolve(__dirname, '../../resources/alignment/_dist/.htaccess');

const voidGrelData = dataset();
const functionsData = dataset();
const outData = dataset();

fs.createReadStream(voidGrel).pipe(ttl_read()).pipe(voidGrelData);
fs.createReadStream(functions).pipe(ttl_read()).pipe(functionsData);
fs.createReadStream(out).pipe(ttl_read()).pipe(outData);

(async () => {
    await Promise.all([
        once(voidGrelData, 'finish'),
        once(functionsData, 'finish'),
        once(outData, 'finish'),
    ]);

    // compute the union of the datasets
    const fullData = voidGrelData.union(functionsData).union(outData);

    const outStreamPretty = fs.createWriteStream(path.resolve(__dirname, `../../resources/alignment/_dist/${currDate}.ttl`));

    const writeStream = fullData.pipe(ttl_write()).pipe(outStreamPretty);
    await once(writeStream, 'finish');
    const data = await fsp.readFile(htaccess, 'utf8')
    var result = data.replace(/^RewriteRule .*$/gm, `RewriteRule ^$ ${currDate}.ttl [R=303]`);

    await fsp.writeFile(htaccess, result, 'utf8');

    console.log('done');
})();
