const axios = require('axios').default;
const { createCanvas, loadImage } = require('canvas'); 
const { DateTime } = require('luxon');

const quoteUrl = (ticker) => { 
    return `https://query1.finance.yahoo.com/v7/finance/options/${ticker}`;
}
const chartUrl = (ticker) => {
    return `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?includePrePost=false&interval=2m&range=1mo`;
}

var db = null;

let statusTicker = undefined;

function init(low) {
    db = low;
    statusTicker = db.get('stockStatus').value()
}

async function handler(msg) {
    if (!msg.content.startsWith('$')) {
        return;
    }
    
    const symbolQuery = msg.content.split(' ')[0].replace('$', '').toUpperCase();
    let price = await getPrice(symbolQuery);
    if(!price)
        return;
    let reply = `${price.name} - ${price.price} (${price.change}%)`;

    if(price.marketHours) 
        reply += ` [${price.marketHours}]`;

    msg.channel.send(reply);
}

function setStockStatus(msg) {
    if(msg.author.id != msg.guild.ownerID) {
        log(`${msg.author.tag} tried to set the status stock but they are not owner.`);
        return;
    }

    db.set('stockStatus', msg.args[0].toUpperCase()).write();
    updateStockStatus(msg.client);
    msg.channel.send(`Set status stock to ${msg.args[0].toUpperCase()}`);
}

async function updateStockStatus(client) {
    const statusStock = db.get('stockStatus').value();
    if(!statusStock)
        return;

    const price = await getPrice(statusStock, true);    
    client.user.setActivity(`${statusStock}: ${price.price} (${price.change}%)`, { type: 'WATCHING' });
}

async function getPrice(symbolQuery, omitAH) {
    var quoteResp;
    try {
        quoteResp = await axios.get(quoteUrl(symbolQuery));
    }
    catch(e) {
        log(`Error contacting API: ${e}`);
        return false;
    }
    if (quoteResp.status >= 300) {
        log('Error contacting API');
        return false;
    }

    if (quoteResp.data['optionChain']['result'].length == 0 || quoteResp.data['optionChain']['error'] != null) {
        log('API returned nothing or an error.')
        return false;
    }

    let quote = quoteResp.data['optionChain']['result'][0]['quote'];
    let name = quote['longName'] || quote['shortName'];
    let symbol = quote['symbol'];
    let currency = quote['currency'];
    let marketHours = '';

    let price = 0;
    let change = 0;

    // This is dumb, yahoo reports some stocks such as $GAYGF as having a 'marketState' of 'PRE' or 'POST'
    // but the OTC exchange doesn't have pre/postmarket
    if ((quote['exchange'] != 'NYQ' && quote['exchange'] != 'NMS') && (quote['marketState'] != 'REGULAR' && quote['marketState'] != 'CLOSED')) {
        quote['marketState'] = 'CLOSED';
    }

    switch(quote['marketState']) {
        case 'PRE':
            marketHours = 'Pre-market';
            if (!quote['preMarketPrice'] || !quote['preMarketChangePercent']) {
                log(`Missing premarket data for ${symbol}`);
                return false;
            }
            price = quote['preMarketPrice'];
            change = quote['preMarketChangePercent'].toFixed(2);
            break;
        case 'REGULAR':
            price = quote['regularMarketPrice'];
            let prevClose = quote['regularMarketPreviousClose'];
            change = (((price - prevClose) / prevClose) * 100).toFixed(2);
            break;
        case 'POST':
        case 'POSTPOST': 
        case 'CLOSED': // use post-market price/change
            // do other exchanges have pre/postmarket?
            if (quote['exchange'] == 'NYQ' || quote['exchange'] == 'NMS') {
                if (!quote['postMarketPrice'] || !quote['postMarketChangePercent']) {
                    log(`Missing post market price or percent`);
                    return false;
                }
                price = quote['postMarketPrice'];
                if(!quote['postMarketChangePercent']) {
                    change = 0;
                } else {
                    change = quote['postMarketChangePercent'].toFixed(2);
                }
                marketHours = quote['marketState'] == 'CLOSED' ? 'Closed' : 'Post-market';
            }
            else {
                price = quote['regularMarketPrice'];
                let prevOpen = quote['regularMarketOpen'];
                change = (((price - prevOpen) / prevOpen) * 100).toFixed(2);
                marketHours = 'Closed';
            }
            break;
        case 'PREPRE':
            // not sure what this market state is for
            break;
        default:
            log(`Found unhandled marketState: ${quote['marketState']} for symbol ${quote['symbol']}`);
            return false;
    }

    price = price.toLocaleString('en-US', { 
        style: 'currency', 
        currency: currency, 
        maximumFractionDigits: price < 1 ? 4 : 2
    });

    let quoteString = `${name} - ${price} (${change}%)`;
    if (marketHours && !omitAH) {
        quoteString += ` [${marketHours}]`;
    }

    return {
        price: price,
        marketHours: marketHours,
        change: change,
        name: name
    }
}

async function generateGraph(symbol) {
    symbol = 'GME';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=true&interval=1h&range=1d`;

    let chartRes;
    try {
        chartRes = await axios.get(url);
    } catch(e) {
        log(`Error receiving stock chart for ${symbol}`);
        return;
    }

    let prices;
    try {
        prices = chartRes.data['chart']['result'][0]['indicators']['quote'][0];
    } catch(e) {
        log(`Unexpected JSON structure: ${JSON.stringify(chartRes.data)}`);
        return;
    }

    let high = 0;
    let low = Number.MAX_VALUE;

    let nullPeriods = [];
    for(const datapoint in prices) {
        for (let i = prices[datapoint].length - 1; i >= 0; i--) {
            let price = prices[datapoint][i];
            // yahoo has periods with no data randomly
            if(price == null) {
                if(!nullPeriods.includes(i)) {
                    chartRes.data['chart']['result'][0]['timestamp'].splice(i, 1);
                    nullPeriods.push(i);
                }
                prices[datapoint].splice(i, 1);
                continue;
            }

            switch(datapoint) {
                case 'high':
                    if(price > high)
                        high = price;
                    break;
                case 'low':
                    if(price < low)
                        low = price;
                    break;
            }
        }
    }

    log(`High: ${high}, Low: ${low}`);
    let timestamps = chartRes.data['chart']['result'][0]['timestamp'];

    let startDate = DateTime.fromSeconds(timestamps[0]);
    let endDate = DateTime.fromSeconds(timestamps[timestamps.length - 1]);

    let diff = endDate.diff(startDate, 'days');
    log(JSON.stringify(diff.toObject()));

    console.time('graph');

    // largest size discord will embed is 400x300, could scale up
    const width = 1600;
    const height = 1200;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.translate(0.5, 0.5);
    const margin = 80;
    
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // y axis
    ctx.strokeStyle = 'black';
    drawLine(ctx, margin, margin, margin, height - margin);
    ctx.stroke();

    // x axis
    ctx.strokeStyle = 'black';
    drawLine(ctx, margin, height - margin, width - margin, height - margin);
    ctx.stroke();

    let yAxisHeight = height - margin * 2;
    let xAxisWidth = width - margin * 2;
    high += (high - low) * 0.05;
    low -= (high - low) * 0.05;
    let range = (high - low).toFixed(2);
    
    let pxPerCent = yAxisHeight / (range * 100);
    let pxPerPoint = xAxisWidth / prices['close'].length;
    log(pxPerPoint);
    
    for (let i = 0; i < prices['close'].length; i++) {
        drawLine(ctx, margin + (pxPerPoint * i), ((high - prices['close'][i]) * 100 * pxPerCent) + margin, margin + (pxPerPoint * (i + 1)), ((high - prices['close'][i + 1]) * 100 * pxPerCent) + margin);
        ctx.stroke();
    }
    
    ctx.font = '24px Courier';
    var text = ctx.measureText('750');
    let fontHeight = text.actualBoundingBoxAscent + text.actualBoundingBoxDescent;
    ctx.fillStyle = 'black';

    let numY = 10;
    let step = range / numY;
    let pxPerCentY = (yAxisHeight - margin) / (range * 100);
    for (let i = 0; i <= numY; i++) {
        let rounded = Math.round(step * i);
        let diff = rounded - (step * i);

        let textMetrics = ctx.measureText(rounded);
        let textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;

        var yPos;
        if (i == 0) {
            yPos = height - margin + (textHeight / 2);
            rounded = Math.round(low);
        } else {
            yPos = height - margin - ((step * i * 100) * pxPerCent) + (textHeight / 2);
        }

        ctx.fillText(rounded, margin / 2 - 10, yPos);
    }


    let num = 10;
    let pxPerText = xAxisWidth / num;
    for (let i = 0; i < num; i++) {
        let textMetrics = ctx.measureText('Feb 30');
        ctx.fillText('Feb 30', margin + (pxPerText * i), height - (margin / 2));
    }

    ctx.translate(-0.5, -0.5);

    const fs = require('fs');
    const out = fs.createWriteStream(__dirname + '/test.png');
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    console.timeEnd('graph');
}

function drawLine(context, startX, startY, endX, endY) {
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.closePath();
}

function log(message) {
    let date = new Date();
    console.log(date.toLocaleTimeString() + " : " + message);
}


module.exports = {
    name: "Stock Prices",
    commands: [
        {
            execute: handler,
            isListener: true
        },
        {
            execute: updateStockStatus,
            isInterval: true,
            period: 60 * 1000
        },
        {
            execute: setStockStatus,
            triggers: [
                '!stockstatus'
            ]
        },
        {
            execute: generateGraph,
            triggers: [
                '!graph'
            ]
        }
    ],
    init: init
}