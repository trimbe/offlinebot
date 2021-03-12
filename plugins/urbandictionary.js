const axios = require('axios').default;

const udApi = 'http://api.urbandictionary.com/v0/define';

async function define(msg) {
    let definitionNum = NaN;
    if(msg.args.length > 1) {
        definitionNum = Number(msg.args[msg.args.length - 1]);
        if(!Number.isNaN(definitionNum)) msg.args.pop();
    }

    const query = msg.args.join(' ');
    const resp = await axios.get(udApi, {
        params: {
            term: query
        }
    });

    if (resp.status >= 300) {
        console.log('Error contacting urbandictionary API');
        return false;
    }

    if (resp.data['list'].length == 0) {
        console.log(`No definitions for ${query}`);
        return;
    }

    let definitionList = resp.data['list'];
    definitionList = definitionList.filter(def => query.toLowerCase() == def.word.toLowerCase());
    const numDefinitions = definitionList.length;
    if((!Number.isNaN(definitionNum) && definitionNum > numDefinitions) || numDefinitions == 0) return;
    const currentNum = Number.isNaN(definitionNum) ? 1 : definitionNum;

    let messageResult = `\n**Definition #${currentNum} out of ${numDefinitions}:**\n`;
    messageResult = messageResult + `${definitionList[currentNum - 1].definition}\n\n`;
    messageResult = messageResult + '**Example:**\n';
    messageResult = messageResult + `${definitionList[currentNum - 1].example}`;

    msg.channel.send(messageResult, { split: true });
}

module.exports = {
    name: "Urbandictionary",
    commands: [
        {
            execute: define,
            triggers: [ '!ud' ]
        }
    ]
}