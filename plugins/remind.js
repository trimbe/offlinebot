const { DateTime } = require('luxon');
const juration = require('juration');

var db = undefined;

function init(low) {
    db = low;
}

function remind(message) {
    const reminders = db
        .defaults({ reminders: [] })
        .get('reminders');

    let content = message.content.split(' ');
    content.shift();
    content = content.join(' ');

    let duration = content.slice(0, content.indexOf('"') - 1);
    try {
        duration = juration.parse(duration);
    } catch(e) {
        console.log(`Error parsing duration: ${e}`);
        return;
    }

    let reminder = content.slice(content.indexOf('"') + 1, content.length - 1);

    reminders.push({
        id: message.author.id,
        timestamp: DateTime.now().plus({ seconds: duration }),
        reminder,
        channel_id: message.channel.id
    }).write();
}

function clearReminders(message) {

}

function tickReminders(client) {    
    const reminders = db
        .defaults({ reminders: [] })
        .get('reminders');

    const remindersArray = reminders.value();

    for (let i = 0; i < remindersArray.length; i++) {
        if (DateTime.now() > DateTime.fromISO(remindersArray[i].timestamp)) {
            client.channels.cache.get(remindersArray[i].channel_id).send(`<@${remindersArray[i].id}>: ${remindersArray[i].reminder}`);
            reminders.set(reminders.value().splice(i, 1)).write();
            return;
        }
    }
}

module.exports = {
    name: "Remind",
    commands: [
        {
            execute: remind,
            triggers: [
                '!remindme'
            ]
        },
        { 
            execute: clearReminders,
            triggers: [
                '!clearreminders'
            ]
        },
        {
            execute: tickReminders,
            isInterval: true,
            period: 1000
        },
    ],
    init: init
}