const juration = require('juration');
const { DateTime } = require('luxon');

var db = undefined;

function init(low) {
    db = low;
}

function ignoreUser(message) {
    if (message.args.length < 2 || message.mentions.users.size == 0) {
        message.channel.send('Required arguments: user mention, duration string.');
        return;
    }

    let user = message.mentions.users.first();
    message.args.shift();
    let duration;
    try {
        duration = juration.parse(message.args.join(' '));
    } catch {
        message.channel.send('Unable to parse duration.');
        return;
    }
    
    let unignoreDate = DateTime.now().plus({ seconds: duration });
    let existing = db.get('ignores').find({ id: user.id }).value();
    if (existing) {
        db.get('ignores').find({ id: user.id }).assign({ until: unignoreDate }).write();
    } else {
        db.get('ignores').push({
            id: user.id,
            until: unignoreDate
        }).write();
    }

    message.channel.send(`${user.username} successfully ignored until: ${unignoreDate.toLocaleString(DateTime.DATETIME_FULL)}`);
}

function unignoreUser(message) {
    if (message.mentions.users.size == 0) {
        message.channel.send('No users mentioned to unignore.');
        return;
    }
    
    let user = message.mentions.users.first();
    db.get('ignores').remove({ id: user.id }).write();

    message.channel.send(`${user.username} unignored.`);
}

function checkIgnore(message) {    
    let ignoreRecord = db.get('ignores').find({ id: message.author.id }).value()
    if (ignoreRecord) {
        message.channel.send(`You are ignored until: ${DateTime.fromISO(ignoreRecord.until).toLocaleString(DateTime.DATETIME_FULL)}`);
    } else {
        message.channel.send('You don\'t seem to be ignored currently.');
    }
    return;
}

module.exports = {
    name: "Ignore",
    commands: [
        {
            execute: ignoreUser,
            triggers: [
                '!ignore'
            ],
            admin: true
        },
        { 
            execute: unignoreUser,
            triggers: [
                '!unignore'
            ],
            admin: true
        },
        {
            execute: checkIgnore,
            triggers: [
                '!checkignore'
            ],
            bypassIgnore: true
        }
    ],
    init: init
}