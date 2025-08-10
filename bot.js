const fs = require('fs');
const { Client, GatewayIntentBits, WebhookClient, Partials } = require('discord.js');

const TOKEN = process.env.TOKEN; MTQwNDA1MTM3NDkyODMwMjIwMw.GcEHau.MhXEWFrfu6yVu3FzKMqYHlYMRgQUy4B_TxPnvI      // توكن البوت (تحطه في Render)
const WEBHOOK_URL = process.env.WEBHOOK; https://canary.discord.com/api/webhooks/1404154553506594937/kzcbzGcM8osHFvU7v9ayod-sY9V_K5PGVQWi8N6HcilFJD-0jfjeDumn9GVv5f2xau4Y
const START_ID = 1000;                 

if (!TOKEN || !WEBHOOK_URL) {
    console.error("❌ لازم تضيف TOKEN و WEBHOOK في متغيرات البيئة.");
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
});

let idsData = {};
if (fs.existsSync('./ids.json')) {
    idsData = JSON.parse(fs.readFileSync('./ids.json', 'utf8'));
}

const webhook = new WebhookClient({ url: WEBHOOK_URL });

function saveIds() {
    fs.writeFileSync('./ids.json', JSON.stringify(idsData, null, 2));
}

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
    const guildId = member.guild.id;

    if (!idsData[guildId]) {
        idsData[guildId] = { nextId: START_ID, assigned: {} };
    }

    const assignedId = idsData[guildId].nextId;
    idsData[guildId].assigned[member.id] = assignedId;
    idsData[guildId].nextId++;
    saveIds();

    let newNick = `${member.user.username} I (${assignedId})`;
    if (newNick.length > 32) {
        newNick = newNick.substring(0, 32);
    }

    try {
        await member.setNickname(newNick, 'Assigning sequential ID');
        await webhook.send({
            embeds: [
                {
                    title: 'ID Assigned',
                    color: 0x00ff00,
                    fields: [
                        { name: 'Guild', value: `${member.guild.name} (${guildId})`, inline: true },
                        { name: 'Member', value: `${member.user.tag} (${member.id})`, inline: true },
                        { name: 'Assigned ID', value: `${assignedId}`, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }
            ]
        });
        console.log(`✅ Assigned ID ${assignedId} to ${member.user.tag}`);
    } catch (err) {
        await webhook.send({
            embeds: [
                {
                    title: 'ID Assignment Failed',
                    color: 0xff0000,
                    fields: [
                        { name: 'Guild', value: `${member.guild.name} (${guildId})`, inline: true },
                        { name: 'Member', value: `${member.user.tag} (${member.id})`, inline: true },
                        { name: 'Reason', value: err.message, inline: false }
                    ],
                    timestamp: new Date().toISOString()
                }
            ]
        });
        console.error(`❌ Failed to set nickname for ${member.user.tag}:`, err);
    }
});

client.login(TOKEN);
