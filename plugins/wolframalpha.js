const axios = require('axios').default;
const jimp = require('jimp');

const apiKey = process.env.WOLFRAM_KEY;
const apiUrl = 'http://api.wolframalpha.com/v2/query';

const wolframAlpha = async (message) => {
	const query = message.content.replace('!wa', '');

    let res = await axios.get(apiUrl, {
        params: {
            appid: apiKey,
            output: 'json',
            input: query,
            ip: '52.41.96.17',
            reinterpret: 'true',
            scantimeout: '5',
            formattimeout: '3',
            excludepodid: 'input'
        }
    });

    if(!res.data.queryresult.success) return;
    let primaryPod = res.data.queryresult.pods.find(pod => {
        return pod.primary !== undefined;
    });

    if(!primaryPod) {
        primaryPod = res.data.queryresult.pods.find(pod => {
            return pod.title == 'Results' || pod.title == 'Result';
        });

        if (!primaryPod) {
            primaryPod = res.data.queryresult.pods[0];
        }
    }

    const resultImg = primaryPod.subpods[0].img.src;
    if(primaryPod.subpods[0].plaintext != '') {
        jimp.read(resultImg)
            .then((img) => {
                const background = new jimp(img.bitmap.width + 4, img.bitmap.height + 4, 0xFFFFFFFF);
                background.composite(img, 2, 2).getBuffer(background.getMIME(), (err, buffer) => {
                    message.channel.send({
                        files: [{
                            attachment: buffer,
                            name: 'result.png',
                        }],
                    });

                });
            });
    }
    else {
        message.channel.send({
            files: [{
                attachment: resultImg,
                name: 'result.png',
            }],
        });
    }
};

module.exports = {
	name: 'Wolfram Alpha',
	commands: [
		{
			execute: wolframAlpha,
			triggers: ['!wa', '!wolframalpha'],
		},
	],
};