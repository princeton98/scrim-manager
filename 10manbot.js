const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    Events,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers, // Needed to access member info 
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

require('dotenv').config();
const token = process.env.DISCORD_BOT_TOKEN;
client.login(token);


let draftingQueue = []; // Queue to store the order of captains drafting
let currentCaptain = null; // Track the captain who is currently drafting
let playerSelections = {}; // Object to store number of players selected by each captain
let availablePlayers = []; // Track available players for selection
let currentCaptainIndex = 0;
let teams = {}; // Object to store teams for each captain
let pickCaptainsInitiator = null; // Track who ran !pickcaptains
let firstPickCaptain = null; // Track which captain has first pick

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const channel = client.channels.cache.get('1361679289967186073'); // testing channel message
    if (channel) {
        channel.send("Hey, I'm online and ready to go!");
    } else {
        console.log('Channel not found!');
    }

    // Removed sending the list of Scrim Players to the channel
});

//!!! Now I want to select team captains, and I want the bot to give me an option to select two captains from the role of scrim players

client.on('messageCreate', async (message) => {
    if (message.content === '!pickcaptains') {
        pickCaptainsInitiator = message.author.id;
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
    // Handle StringSelectMenu interactions
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_captains') {
            const selectedIds = interaction.values;
            draftingQueue = [...selectedIds];
            selectedIds.forEach(id => { playerSelections[id] = 0; });
            // Rebuild the select menu as disabled
            const oldMenu = interaction.component;
            const disabledMenu = new StringSelectMenuBuilder()
                .setCustomId(oldMenu.customId)
                .setPlaceholder(oldMenu.placeholder)
                .setMinValues(oldMenu.minValues)
                .setMaxValues(oldMenu.maxValues)
                .setDisabled(true)
                .addOptions(oldMenu.options.map(opt => ({
                    label: opt.label,
                    value: opt.value
                })));
            const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
            await interaction.update({
                content: `✅ Team captains selected: ${selectedIds.map(id => `<@${id}>`).join(' and ')}`,
                components: [disabledRow],
            });
            // Prompt for first pick selection
            const pickMenu = new StringSelectMenuBuilder()
                .setCustomId('select_first_pick')
                .setPlaceholder('Select which captain gets first pick')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(selectedIds.map(id => ({
                    label: interaction.guild.members.cache.get(id)?.displayName || id,
                    value: id
                })));
            const pickRow = new ActionRowBuilder().addComponents(pickMenu);
            await interaction.followUp({
                content: 'Who gets first pick in the draft?',
                components: [pickRow],
            });
            return;
        }
        if (interaction.customId === 'select_first_pick') {
            firstPickCaptain = interaction.values[0];
            // Reorder draftingQueue so firstPickCaptain is first
            draftingQueue = [firstPickCaptain, ...draftingQueue.filter(id => id !== firstPickCaptain)];
            currentCaptainIndex = 0;
            currentCaptain = draftingQueue[currentCaptainIndex];
            await interaction.update({
                content: `First pick goes to <@${firstPickCaptain}>!`,
                components: [],
            });
            // Initialize availablePlayers here
            const guild = interaction.guild;
            await guild.members.fetch();
            const role = guild.roles.cache.get('1361013468731539690');
            if (!role) return interaction.followUp('Role not found.');
            const members = Array.from(role.members.values());
            availablePlayers = members
                .filter(member => !draftingQueue.includes(member.id))
                .map(member => ({ label: member.displayName, value: member.id }));
            await askForPlayerSelection(currentCaptain, interaction);
            return;
        }
        if (interaction.customId === 'select_players') {
            // Bypass captain restriction for testing
            // if (interaction.user.id !== currentCaptain) {
            //     await interaction.reply({ content: 'Only the current captain can make selections!', ephemeral: true });
            //     return;
            // }
            const selectedPlayerIds = interaction.values;
            if (!teams[currentCaptain]) teams[currentCaptain] = [];
            const actualSelections = selectedPlayerIds;
            teams[currentCaptain].push(...actualSelections);
            playerSelections[currentCaptain] += actualSelections.length;
            availablePlayers = availablePlayers.filter(player => !actualSelections.includes(player.value));
            // Show display names for player selection
            const selectedNames = actualSelections.map(id => {
                const member = interaction.guild.members.cache.get(id);
                return member ? member.displayName : id;
            });
            await interaction.reply({
                content: `✅ Players selected by <@${currentCaptain}>: ${selectedNames.join(', ')}`,
            });
            // Remove forced switch restriction for testing
            // if (playerSelections[currentCaptain] >= 5) { ... }
            if (availablePlayers.length === 0) {
                await presentTeams(interaction);
                return;
            }
            // Switch to next captain (round-robin)
            const previousCaptain = currentCaptain;
            currentCaptainIndex = (currentCaptainIndex + 1) % draftingQueue.length;
            currentCaptain = draftingQueue[currentCaptainIndex];
            await showTeams(interaction);
            await askForPlayerSelection(currentCaptain, interaction);
            return;
        }
    }
    // Handle Button interactions
    if (interaction.isButton()) {
        // Bypass captain restriction for testing
        // if (interaction.customId.startsWith('pick_player_') || interaction.customId === 'done_picking') {
        //     if (interaction.user.id !== currentCaptain) {
        //         await interaction.reply({ content: 'Only the current captain can make selections!', ephemeral: true });
        //         return;
        //     }
        // }
        if (interaction.customId.startsWith('pick_player_')) {
            const playerId = interaction.customId.replace('pick_player_', '');
            if (!teams[currentCaptain]) teams[currentCaptain] = [];
            // Remove max picks restriction for testing
            // if (playerSelections[currentCaptain] >= 5) {
            //     await interaction.reply({ content: 'You have already selected 5 players!', ephemeral: true });
            //     return;
            // }
            teams[currentCaptain].push(playerId);
            playerSelections[currentCaptain] += 1;
            availablePlayers = availablePlayers.filter(player => player.value !== playerId);
            await interaction.deferUpdate();
            // If that was the last player, end the draft and present teams
            if (availablePlayers.length === 0) {
                await presentTeams(interaction);
                return;
            }
            await showTeams(interaction);
            await askForPlayerSelection(currentCaptain, interaction);
            return;
        }
        if (interaction.customId === 'done_picking') {
            await interaction.update({ content: `<@${currentCaptain}> has finished their selections.`, components: [] });
            // Switch to next captain or finish draft
            const previousCaptain = currentCaptain;
            const unfinishedCaptains = draftingQueue.filter(captain => availablePlayers.length > 0);
            if (unfinishedCaptains.length > 0 && availablePlayers.length > 0) {
                currentCaptainIndex = (currentCaptainIndex + 1) % draftingQueue.length;
                currentCaptain = draftingQueue[currentCaptainIndex];
                await showTeams(interaction);
                await askForPlayerSelection(currentCaptain, interaction);
            } else {
                await presentTeams(interaction);
            }
            return;
        }
    }
});

// Present teams at the end of the draft
async function presentTeams(interaction) {
    let result = '**Draft Results:**\n';
    let secondCaptain = null;
    if (draftingQueue.length === 2) {
        secondCaptain = draftingQueue.find(id => id !== firstPickCaptain);
    }
    // Team 1 (first pick)
    if (firstPickCaptain) {
        const members = teams[firstPickCaptain]?.map(id => `<@${id}>`).join(', ') || '';
        const captainMember = interaction.guild.members.cache.get(firstPickCaptain);
        const captainName = captainMember ? captainMember.displayName : firstPickCaptain;
        result += `\n<@${firstPickCaptain}>\n**Captain of Team 1: ${captainName} (<@${firstPickCaptain}>):** ${members}`;
    }
    // Team 2 (side selection)
    if (secondCaptain) {
        const members = teams[secondCaptain]?.map(id => `<@${id}>`).join(', ') || '';
        const captainMember = interaction.guild.members.cache.get(secondCaptain);
        const captainName = captainMember ? captainMember.displayName : secondCaptain;
        result += `\n<@${secondCaptain}>\n**Captain of Team 2: ${captainName} (<@${secondCaptain}>):** ${members}`;
        result += `\n\n<@${secondCaptain}> and their team have side selection for the first map.`;
    }
    await interaction.followUp({ content: result });
}

//functions


// Now from the captains, i want them to select their players, and give them the option to select a multitude of players, and is it possible to add the nba draft noise to this feature?
async function askForPlayerSelection(captain, interaction) {
    const guild = interaction.guild;
    await guild.members.fetch();
    const options = availablePlayers.slice(0, 25).map(player => {
        const member = guild.members.cache.get(player.value);
        return {
            label: member ? member.displayName : player.label,
            value: player.value
        };
    });

    if (options.length < 5 && options.length > 0) {
        const buttons = options.map(player =>
            new ButtonBuilder()
                .setCustomId(`pick_player_${player.value}`)
                .setLabel(player.label)
                .setStyle(ButtonStyle.Primary)
        );
        // Add a 'Done' button
        buttons.push(
            new ButtonBuilder()
                .setCustomId('done_picking')
                .setLabel('Done')
                .setStyle(ButtonStyle.Success)
        );
        const row = new ActionRowBuilder().addComponents(buttons);
        await interaction.followUp({
            content: `${captain === interaction.user.id ? 'You' : `<@${captain}>`}, select the remaining players for your team. Click 'Done' when finished:`,
            components: [row],
        });
        return;
    } else if (options.length === 0) {
        await interaction.followUp({
            content: `<@${captain}>, there are no players left to select.`,
            flags: 64,
        });
        return;
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId('select_players')
        .setPlaceholder(`${captain === interaction.user.id ? 'You' : `<@${captain}>`} select players for your team`)
        .setMinValues(1)  // Allow captains to select at least one player
        .setMaxValues(5)  // Allow captains to select up to 5 players
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.followUp({
        content: `${captain === interaction.user.id ? 'You' : `<@${captain}>`}, it's your turn to select players for your team!`,
        components: [row],
    });
}

// After switching to the next captain, show updated teams
const showTeams = async (interaction) => {
    let result = '**Current Teams:**\n';
    for (const captainId of Object.keys(teams)) {
        const members = teams[captainId].map(id => {
            const member = interaction.guild.members.cache.get(id);
            return member ? member.displayName : id;
        }).join(', ');
        // Use display name for captain, with @ mention at the end
        const captainMember = interaction.guild.members.cache.get(captainId);
        const captainName = captainMember ? captainMember.displayName : captainId;
        result += `\n**Captain ${captainName} (<@${captainId}>):** ${members}`;
    }
    await interaction.followUp({ content: result });
};
