const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

var commands = [];
var listeners = [];
var intervals = [];

const pluginFiles = fs.readdirSync('./plugins');
pluginFiles.forEach(file => {
    if (!file.includes('js'))
        return;
    const plugin = require(`./plugins/${file}`);
    if (!plugin.commands)
        return;
    
    if (plugin.init) 
        plugin.init(db);

    plugin.commands.forEach(command => {
        if(command.isListener) {
            listeners.push(command);
        }
        else if(command.isInterval) {
            intervals.push(command);
        }
        else {
            if (command.triggers.includes("!graph") || command.triggers.includes('!wae'))
                command.execute();
            commands.push(command)
        }
    });
});

client.on('ready', () => {
    console.log(`Client connected as ${client.user.tag}`);

    intervals.forEach(interval => {
        interval.execute(client);
        client.setInterval(interval.execute, interval.period, client);
    })
});

client.on('message', msg => {
    processMessage(msg);
});

client.on('messageUpdate', (oldMsg, newMsg) => {
    processMessage(newMsg);
})

function processMessage(msg) {
    if (msg.author.bot) 
        return;

    let ignored = db.get('ignores').find({ id: msg.author.id }).value() && msg.guild.ownerID != msg.author.id;

    if (!ignored) {
        listeners.forEach(listener => {
            listener.execute(msg);
        });
    }

    const firstWord = msg.content.split(/ +/).shift().toLowerCase();

    const command = commands.find(command => { 
        if ((command.admin && msg.guild.ownerID == msg.author.id) || command.admin == undefined) {
            return command.triggers.includes(firstWord);
        }
    });

    if(!command || (ignored && !command.bypassIgnore)) 
        return;
    
    const argsRegex = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
    const args = [];
    let m;

    while ((m = argsRegex.exec(msg.content)) !== null) {
        if (m.index === argsRegex.lastIndex) {
            argsRegex.lastIndex++;
        }
        args.push(m[1] ? m[1] : m[2] ? m[2] : m[3]);
    }

    args.shift();

    msg.args = args;
    msg.argsString = args.join(' ');

    command.execute(msg);
}

client.login(process.env.DISCORD_BOT_TOKEN);