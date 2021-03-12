const gtranslate = require('@vitalets/google-translate-api');
const languages = require('country-data').languages;

const _8ball = message => {
    const answers = [
        'Yes',
        'No'
    ];

    message.channel.send(answers[Math.floor(Math.random() * answers.length)]);
};

const choose = (message) => {
	const choice = message.args[Math.floor(Math.random() * message.args.length)];
	message.channel.send(choice);
};

const translate = (message) => {
    let language = 'en';
	if(message.args[0].startsWith('to=')) {
		const country = message.args[0].replace('to=', '');
		const foundLang = languages.all.find(el => {
			return el.name.toLowerCase() == country.toLowerCase();
		});

		if (foundLang != undefined) {
			language = foundLang.alpha2;
		}

		message.args.shift();

		gtranslate(message.args.join(' '), { to: language }).then(res => {
			message.channel.send(res.text);
		});
	}
	else if(message.args[0].startsWith('from=')) {
		const country = message.args[0].replace('from=', '');
		const foundLang = languages.all.find(el => {
			return el.name.toLowerCase() == country.toLowerCase();
		});

		if (foundLang != undefined) {
			const fromLang = foundLang.alpha2;
			message.args.shift();
			gtranslate(message.args.join(' '), { to: language, from: fromLang }).then(res => {
				message.channel.send(res.text);
			});
		}
		else {
			message.args.shift();
			gtranslate(message.args.join(' '), { to: language }).then(res => {
				message.channel.send(res.text);
			});
		}

	}
	else {
		gtranslate(message.args.join(' '), { to: language }).then(res => {
			message.channel.send(res.text);
		});
	}
};

module.exports = {
    name: "Miscellaneous Commands",
    commands: [
        {
            execute: _8ball,
            triggers: [ '!8', '!8ball' ]
        },
        {
            execute: choose,
            triggers: [ '!choose' ]
        },
        {
            execute: translate,
            triggers: [ '!tr', '!translate' ] 
        }
    ]
}