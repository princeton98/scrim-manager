const { 
    Client, 
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    Events
} = require('discord.js');

const client = new Client({ intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers, // Needed to access member info 
    GatewayIntentBits.MessageContent
],
partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
 });

 const role = '1361013468731539690'; // Scrim Players ID

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    const channel = client.channels.cache.get('1361679289967186073'); // testing channel message
    if (channel) {
        channel.send("Hey, I'm online and ready to go!");
    } else {
        console.log('Channel not found!');
    }



    // !!!! lets get a list of all the members of a specific role, in this case, @Scrim Players, and list them out initially


    console.log(`Logged in as ${client.user.tag}`);
    const guild = client.guilds.cache.first(); // or use client.guilds.cache.get(GUILD_ID)
    if (!guild) return console.log('Bot is not in any guilds.');

    // Fetch all members (required if members aren't cached)
    await guild.members.fetch();
    const roleId = '1361013468731539690';
    const role = guild.roles.cache.get(roleId);
    if (!role) return console.log('Role not found.');
    
    const membersWithRole = role.members.map(member => member.user.tag);

    if (channel && channel.isTextBased()) {
        channel.send(`Members with @Scrim Players:\n${membersWithRole.join('\n')}`);
    }


});

//!!! Now I want to select team captains, and I want the bot to give me an option to select two captains from the role of scrim players

client.on('messageCreate', async (message) => {
    if (message.content === '!pickcaptains') {
        const guild = message.guild;
        await guild.members.fetch();

        const role = guild.roles.cache.get('1361013468731539690');
        if (!role) return message.reply('Role not found.');

        const members = Array.from(role.members.values());

        const options = members.map(member => ({
            label: member.user.username,
            value: member.id
        })).slice(0, 25);

        const select = new StringSelectMenuBuilder()
            .setCustomId('select_captains')
            .setPlaceholder('Select 2 captains')
            .setMinValues(2)
            .setMaxValues(2)
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(select);

        await message.reply({
            content: 'Select 2 team captains from the Scrim Players:',
            components: [row],
        });
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'select_captains') {
        const selectedIds = interaction.values;
        const captains = selectedIds.map(id => `<@${id}>`);

        await interaction.reply({
            content: `✅ Team captains selected: ${captains.join(' and ')}`,
            ephemeral: false,
        });
    }
});




client.login('MTM2MTMyNDk1MTQ1Nzc2MzQ2OA.G654Fs.9LXdkE6MvzNIPxXIDZs4rPM2r4G48M0sHBpWPQ');
