const axios = require('axios').default;
const discord = require('discord.js');
const { createCanvas } = require('canvas');
const fs = require('fs');
const neuquant = require('neuquant');

const climacellToken = process.env.CLIMACELL_TOKEN;
const geocodeKey = process.env.GOOGLE_GEOCODE_KEY;
const apiURL = 'https://data.climacell.co/v4/timelines';
const geocodeURL = 'https://maps.googleapis.com/maps/api/geocode/json';

const weatherCodes = {
    '0': 'Unknown',
    '1000': 'Clear',
    '1001': 'Cloudy',
    '1100': 'Mostly Clear',
    '1101': 'Partly Cloudy',
    '1102': 'Mostly Cloudy',
    '2000': 'Fog',
    '2100': 'Light Fog',
    '3000': 'Light Wind',
    '3001': 'Wind',
    '3002': 'Strong Wind',
    '4000': 'Drizzle',
    '4001': 'Rain',
    '4200': 'Light Rain',
    '4201': 'Heavy Rain',
    '5000': 'Snow',
    '5001': 'Flurries',
    '5100': 'Light Snow',
    '5101': 'Heavy Snow',
    '6000': 'Freezing Drizzle',
    '6001': 'Freezing Rain',
    '6200': 'Light Freezing Rain',
    '6201': 'Heavy Freezing Rain',
    '7000': 'Ice Pellets',
    '7101': 'Heavy Ice Pellets',
    '7102': 'Light Ice Pellets',
    '8000': 'Thunderstorm'
};

async function geocodeLocation(query) {
    try {
        var res = await axios.get(geocodeURL, {
            params: {
                address: query,
                key: geocodeKey
            }
        });
    } catch (e) {
        console.log(e);
    }


    if (res['data']['status'] == 'ZERO_RESULTS') {
        log(`Found no geocode results for: ${query}`);
        return;
    }

    let location = res['data']['results'][0]['geometry']['location'];
    let address = res['data']['results'][0]['formatted_address'];

    return {
        location,
        address
    };
}

async function weather(message) {
    if (message.argsString == '') {
        return;
    }
    let geocode = await geocodeLocation(message.argsString);
    if (!geocode)
        return;

    let reqData = {
        location: `${geocode.location.lat}, ${geocode.location.lng}`,
        fields: [
            'temperature',
            'temperatureApparent',
            'windSpeed',
            'windGust',
            'windDirection',
            'humidity',
            'weatherCode'
        ],
        timesteps: ['current'],
        units: 'imperial'
    }

    try {
        var res = await axios.post(apiURL, reqData, {
            params: {
                apikey: climacellToken
            },
            headers: {
                'Content-Type': 'application/json'
            }
        });

        var data = res.data.data.timelines[0].intervals[0];
    } catch(e) {
        //console.log(e);
    }

    const condition = weatherCodes[data.values.weatherCode];
    const temperature = data.values.temperature;
    const tempApparent = data.values.temperatureApparent;
    const windSpeed = data.values.windSpeed;
    const windGust = data.values.windGust;
    const windDirection = data.values.windDirection;

    const tempF = temperature.toFixed(1);
    const tempC = ((temperature - 32) * (5 / 9)).toFixed(1);
    const tempApparentF = tempApparent.toFixed(1);
    const tempApparentC = ((tempApparent - 32) * (5 / 9)).toFixed(1);
    const humidity = data.values.humidity;
    const windSpeedMiles = windSpeed.toFixed(1);
    const windSpeedKm = (windSpeed * 1.609344).toFixed(1);
    const windGustMiles = windGust.toFixed(1);
    const windGustKm = (windGust * 1.609344).toFixed(1);

    const canvas = createCanvas(400, 110);
    const ctx = canvas.getContext('2d');

    const altCanvas = createCanvas(400, 110);
    const altCtx = altCanvas.getContext('2d');

    ctx.fillStyle = '#36393E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    let font = 'Helvetica';

    ctx.font = '14pt ' + font;
    altCtx.font = '14pt ' + font;
    ctx.fillStyle = 'white';
    altCtx.fillStyle = 'white';

    let metrics = ctx.measureText(`${condition} in ${geocode.address}`);
    let textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

    ctx.fillText(`${condition} in ${geocode.address}`, 10 + metrics.actualBoundingBoxLeft, 10 + metrics.actualBoundingBoxAscent, canvas.width - 40);

    ctx.fillText(`${humidity}%`, 230, 40 + textHeight);
    altCtx.drawImage(canvas, 0, 0);

    altCtx.fillText(`${windGustMiles} mph\n${windGustKm} kmh`, 120, 40 + textHeight);
    altCtx.fillText(`${tempApparentF} F\n${tempApparentC} C`, 10, 40 + textHeight);

    ctx.fillText(`${windSpeedMiles} mph\n${windSpeedKm} kmh`, 120, 40 + textHeight);
    ctx.fillText(`${tempF} F\n${tempC} C`, 10, 40 + textHeight);

    ctx.font = '10pt ' + font;
    altCtx.font = '10pt ' + font;    

    ctx.fillText('WIND', 120, 40 + textHeight + 40);
    altCtx.fillText('GUST', 120, 40 + textHeight + 40);

    ctx.fillText('TEMP', 10, 40 + textHeight + 40);
    altCtx.fillText('APPARENT', 10, 40 + textHeight + 40);

    ctx.fillText('HUMIDITY', 230, 40 + textHeight + 40);
    altCtx.fillText('HUMIDITY', 230, 40 + textHeight + 40);

    let buffer = encodeGif([canvas, altCanvas]);

    message.channel.send({
        files: [{
            attachment: buffer,
            name: 'result.gif',
        }],
    });

    return;
}

function generateColorTable(canvases) {
    let table = [];

    for (let canvas of canvases) {
        let imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let pixels = [];

        for (let i = 0; i < canvas.height * canvas.width * 4; i += 4) {
            let r = imageData.data[i];
            let g = imageData.data[i + 1];
            let b = imageData.data[i + 2];
            let color = r << 16 | g << 8 | b;
            pixels.push(r);
            pixels.push(g);
            pixels.push(b);
        }

        let neuObj = neuquant.quantize(pixels, 10);
        table.push(neuObj);
    }

    return table;
}

function encodeGif(canvases) {
    let colorTable = generateColorTable(canvases);
    const gifOut = fs.createWriteStream(__dirname + '/test.gif');
    let buffer = Buffer.alloc(20000);
    let offset = 0;

    let width = canvases[0].width;
    let height = canvases[0].height;
    //signature
    offset = buffer.write('GIF89a', 'ascii');

    //screen descriptor

    // raster width
    offset = buffer.writeUInt16LE(width, offset);
    // raster height
    offset = buffer.writeUInt16LE(height, offset);
    // packed flags
    let packed = 0b01110000;
    let colorTableLen = Math.ceil(Math.log2(colorTable.length - 1) - 1);
    offset = buffer.writeUInt8(packed, offset);
    // background color index
    offset = buffer.writeUInt8(0, offset);
    // pixel aspect ratio
    offset = buffer.writeUInt8(0, offset);

    // global color table
    // let desiredTableBytes = 3 * Math.pow(2, Math.ceil(Math.log2(colorTable.length) - 1) + 1);
    // let bytesUsed = 0;

    // // write color table
    // for (let i = 0; i < colorTable.length; i++) {
    //     let b = colorTable[i] & 0xFF;
    //     let g = (colorTable[i] >> 8) & 0xFF;
    //     let r = (colorTable[i] >> 16) & 0xFF;

    //     offset = buffer.writeUInt8(r, offset);
    //     offset = buffer.writeUInt8(g, offset);
    //     offset = buffer.writeUInt8(b, offset);
    //     bytesUsed += 3;
    // }

    // while(bytesUsed < desiredTableBytes) {
    //     offset = buffer.writeUInt8(0, offset);
    //     bytesUsed++;
    // }


    for (let i = 0; i < canvases.length; i++) {
        // graphic control extension

        // extensions introducer
        offset = buffer.writeUInt8(0x21, offset);
        // graphic control label
        offset = buffer.writeUInt8(0xF9, offset);
        // block size 
        offset = buffer.writeUInt8(4, offset);
        // packed fields
        offset = buffer.writeUInt8(0b00001000, offset);
        // delay time 
        offset = buffer.writeUInt16LE(300, offset);
        // transparent color index
        offset = buffer.writeUInt8(0, offset);
        // terminator
        offset = buffer.writeUInt8(0, offset);


        // image descriptor

        // image separator
        offset = buffer.writeUInt8(0x2C, offset);
        // image left position
        offset = buffer.writeUInt16LE(0, offset);
        // image top position
        offset = buffer.writeUInt16LE(0, offset);
        // image width
        offset = buffer.writeUInt16LE(width, offset);
        // image height
        offset = buffer.writeUInt16LE(height, offset);
        // packed fields
        let packed = 0b10000000; 
        let colorTableLen = Math.ceil(Math.log2(colorTable[i].palette.length / 3) - 1);
        offset = buffer.writeUInt8(packed | colorTableLen, offset); 
        
        let desiredTableBytes = 3 * Math.pow(2, Math.ceil(Math.log2(colorTable[i].palette.length / 3) - 1) + 1);
        let bytesUsed = 0;

        // write color table
        for (let j = 0; j < colorTable[i].palette.length; j += 3) {
            let b = colorTable[i].palette[j + 2];
            let g = colorTable[i].palette[j + 1];
            let r = colorTable[i].palette[j];

            offset = buffer.writeUInt8(r, offset);
            offset = buffer.writeUInt8(g, offset);
            offset = buffer.writeUInt8(b, offset);
            bytesUsed += 3;
        }

        while(bytesUsed < desiredTableBytes) {
            offset = buffer.writeUInt8(0, offset);
            bytesUsed++;
        }

        // image data

        // lzw code size
        let codeSize = 8;
        offset = buffer.writeUInt8(codeSize, offset);

        let input = colorTable[i].indexed;

        let codes = new Map();
        let palette = colorTable[i].palette;
        for (let j = 0; j < palette.length; j++) {
            codes.set(j.toString(), j);
        }
        let packer = new Packer();
        let codeLen = codeSize + 1;
        let nextCode = Math.pow(2, codeSize) + 2;

        let inputBuffer = '';

        packer.pack(Math.pow(2, codeSize), codeLen);
        for(let i = 0; i < input.length; i++) {
            let val = input[i];
            if (codes.has(inputBuffer + ',' + val)) {
                inputBuffer = inputBuffer + ',' + val;
            } else {
                codes.set(inputBuffer + ',' + val, nextCode++);
                packer.pack(codes.get(inputBuffer.toString()), codeLen);
                if (nextCode - 1 > Math.pow(2, codeLen) - 1)
                    codeLen++;
                
                // reset code table
                if (nextCode == 4096) {
                    // clear code
                    packer.pack(Math.pow(2, codeSize), codeLen);
                    codeLen = codeSize + 1;
                    codes.clear();
                    nextCode = Math.pow(2, codeSize) + 2;
                    for (let j = 0; j < palette.length; j++) {
                        codes.set(j.toString(), j);
                    }
                }
                
                inputBuffer = val;
            }
        }
        packer.pack(codes.get(inputBuffer.toString()), codeLen);
        packer.pack(Math.pow(2, codeSize) + 1, codeLen);

        let bytes = packer.getBytes();
        
        // block size
        offset = buffer.writeUInt8(Math.min(255, bytes.length), offset);

        let bytesWritten = 0;
        for (let i = 0; i < bytes.length; i++) {
            if (bytesWritten > 0 && bytesWritten % 255 == 0) {
                offset = buffer.writeUInt8(Math.min(255, bytes.length - bytesWritten), offset);
            }
            offset = buffer.writeUInt8(bytes[i], offset);
            bytesWritten++;
        }

        offset = buffer.writeUInt8(0, offset);
    }    

    // repeat application extension

    // extension introducer
    offset = buffer.writeUInt8(0x21, offset);
    // extension label
    offset = buffer.writeUInt8(0xFF, offset);
    // block size
    offset = buffer.writeUInt8(0x0B, offset);
    // application identifier
    offset += buffer.write('NETSCAPE', offset, 'ascii');
    // auth code
    offset += buffer.write('2.0', offset, 'ascii');
    
    offset = buffer.writeUInt8(0x03, offset);
    offset = buffer.writeUInt8(0x01, offset);
    offset = buffer.writeUInt8(0x00, offset);
    offset = buffer.writeUInt8(0x00, offset);
    offset = buffer.writeUInt8(0x00, offset);

    // gif trailer
    offset = buffer.writeUInt8(0x3B, offset);

    buffer = buffer.slice(0, offset);

    gifOut.write(buffer);
    gifOut.end();

    return buffer;
}

class Packer {
    constructor() {
        this.bytes = [];
        this.bits = 0;
        this.curByte = 0;
    }

    pack(code, codeLen) {
        this.curByte |= code << this.bits;
        this.bits += codeLen;

        while (this.bits >= 8) {
            this.bytes.push(this.curByte & 0xFF);
            this.bits -= 8;
            this.curByte >>= 8;
        }
    }

    getBytes() {
        this.bytes.push(this.curByte);
        return this.bytes;
    }
}

module.exports = {
    name: "Weather",
    commands: [
        {
            execute: weather,
            triggers: [
                '!we',
                '!weather'
            ]
        }
    ]
}