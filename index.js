'use strict';

const Discord = require('discord.js');
const fs = require('fs');
const jsonstore = require('jsonstore.io');

// Setup

const config = JSON.parse(fs.readFileSync('config.json'));
const prefix = "!"
const client = new Discord.Client();
const storage = new Storage(config.storage_token);

//TODO: delete these
storage.addPrompt("Some cool prompt.");
storage.addPrompt("And another one.");
storage.addPrompt("One more for good measure.");

// Running the app

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
    if(isCommand("daily", msg)) dailyCmd(msg);
    else if(isCommand("random", msg)) randomCmd(msg);
    else if(isCommand("submit", msg)) submitCmd(msg);
    else if(isCommand("submissions", msg)) submissionsCmd(msg);
    else if(isCommand("help", msg)) helpCmd(msg);
    else if(isCommand("promptadd", msg)) modOnly(msg, promptAddCmd);
    else if(isCommand("promptedit", msg)) modOnly(msg, promptEditCmd);
    else if(isCommand("promptdelete", msg)) modOnly(msg, promptDeleteCmd);
});

client.login(config.api_token);

// Command handlers

function dailyCmd(msg) {
    storage.getDailyPrompt().then(dailyPrompt => {
        if(!dailyPrompt)
            msg.reply("sorry, but I'm fresh out of new prompts!");
        else
            msg.reply("the daily prompt today is prompt #" + dailyPrompt.id + ":\n\n" + dailyPrompt.text);
    });
}

function randomCmd(msg) {
    storage.getPrompts().then(prompts => {
        const promptArray = Object.values(prompts);
        if(promptArray.length < 1)
            msg.reply("sorry, but there are no prompts right now.");
        else {
            const randPrompt = promptArray[randBetween(0, promptArray.length - 1)];
            msg.reply("your random prompt is prompt #" + randPrompt.id + ":\n\n" + randPrompt.text);
        }
    });
}

function submitCmd(msg) {
    const args = msg.content.trim().split(/\s+/);
    storage.getPrompts().then(prompts => {
        if(args.length !== 3 || !prompts["P" + args[1]] || !isValidUrl(args[2])) {
            msg.reply("Invalid command. To submit an entry for a prompt, use `!submit [prompt #] [url]`.");
        } else {
            storage.addSubmissionToPrompt(args[1], msg.author.id, args[2]).then(() =>
                msg.reply("Thanks for your submission!")
            );
        }
    });
}

function submissionsCmd(msg) {
    const args = msg.content.trim().split(/\s+/);
    if(args.length !== 2) {
        msg.reply("Invalid command. To view the list of submissions for a prompt, use `!submissions [prompt #]`.");
        return;
    }
    storage.getPrompts().then(prompts => {
        if(!prompts["P" + args[1]])
            msg.reply("there is no prompt with that ID.");
        else {
            const prompt_ = prompts["P" + args[1]];
            if((prompt_.submissions || []).length < 1)
                msg.reply("There are no submissions for that prompt.");
            else {
                var replyMsg = `Listing submissions for prompt #${prompt_.id}:\n\n_${prompt_.text}_\n`;
                //TODO: show author by readable name
                prompt_.submissions.forEach((sub, i) => replyMsg += `\n#${i}: ${sub.link}`);
                msg.reply(replyMsg);
            }
        }
    });
}

function helpCmd(msg) {
    const helpText = `I support the following commands:

!daily - get the daily prompt
!random - get a random prompt
!submit <prompt #> <link> - submit an entry for a prompt
!submissions <prompt #> - get the user submissions for a prompt
!help - display this help text

Mod-only:
!promptadd <text> - add a prompt
!promptedit <prompt #> <text> (coming soon) - edit a prompt
!promptdelete <prompt #> (coming soon) - delete a prompt
    `.trim()
    msg.reply(helpText);
}

function promptAddCmd(msg) {
    const args = msg.content.trim().split(/\s/);
    if(args.length < 2)
        msg.reply("Invalid command. To add a new prompt, use `!promptadd [prompt text]`.");
    else {
        const promptText = args.slice(1).join(" ");
        storage.addPrompt(promptText).then(() =>
            msg.reply("prompt added!")
        ).catch(() =>
            msg.reply("there was an issue adding your prompt.")
        );
    }
}

function promptEditCmd(msg) {
    comingSoon(msg);
}

function promptDeleteCmd(msg) {
    comingSoon(msg);
}

// Storage

function Storage(storageToken) {
    const store = new jsonstore(storageToken);
    var currentJob = Promise.resolve(null);

    const queue = fn => {
        currentJob = currentJob.then(fn);
        return currentJob;
    };

    const getData = () => store.read("/").then(data =>
        (data == null) ? { prompts: {}, todayPrompt: null, nextId: 1 } : data
    );

    //TODO: remove this
    queue(() => store.delete("/"));

    this.addPrompt = (text) => {
        return queue(() => getData().then(data => {
            data.prompts["P"+data.nextId] = new Prompt(data.nextId, text);
            data.nextId++;
            return store.write("/", data);
        }));
    };

    this.removePrompt = (promptId) => {
        return queue(() => store.delete("data/prompts/P" + promptId));
    };

    this.getDailyPrompt = () => {
        return queue(() => getData().then(data => {
            if(!data.todayPrompt || !isToday(data.todayPrompt.date)) {
                var nextPrompt = null;
                var nextPromptId = (data.todayPrompt || { promptId : 1 }).promptId - 1;

                while(!nextPrompt && nextPromptId < data.nextId) {
                    nextPrompt = data.prompts["P" + (++nextPromptId)];
                }

                if(!nextPrompt) {
                    data.todayPrompt = null;
                    return store.write("/", data).then(() => null);
                } else {
                    data.todayPrompt = new DailyPrompt(nextPromptId);
                    data.prompts["P" + nextPromptId].hasBeenDaily = true;
                    return store.write("/", data).then(() => nextPrompt);
                }
            } else {
                return data.prompts["P" + data.todayPrompt.promptId];
            }
        }));
    };

    this.getPrompts = () => getData().then(data => data.prompts);

    this.addSubmissionToPrompt = (promptId, author, link) =>
        queue(() => getData().then(data => {
            if(data.prompts["P" + promptId] == null)
                return false;
            else {
                const newIndex = (data.prompts["P" + promptId].submissions || []).length;
                return store.write("prompts/P" + promptId + "/submissions/" + newIndex, new Submission(link, author));
            }
        }));
}

function Prompt(id, text) {
    this.id = id;
    this.text = text;
    this.hasBeenDaily = false;
    this.submissions = null;
}

function Submission(link, author, date) {
    this.link = link;
    this.author = author;
    this.date = date || new Date();
}

function DailyPrompt(promptId) {
    this.date = new Date();
    this.promptId = promptId;
}

// Helper functions

function isCommand(cmdStr, msg) {
    return msg.content.startsWith(prefix + cmdStr);
}

function isToday(date) {
    const today = new Date();
    return
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
}

function randBetween(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

function isValidUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        return url.protocol.startsWith("http"); // to prevent dodgy things like "javascript:...some code"
    } catch(e) {
        return false;
    }
}

function modOnly(msg, fn) {
    const senderRole = msg.member.roles.find((role) => role.name === "Tapioca God Mod" || role.name === "Supreme Pudding Admin");
    if(senderRole != undefined) {
        return fn(msg);
    } else {
        msg.reply("you must be a mod or admin to use this command.");
    }
}

function comingSoon(msg) {
    msg.reply("sorry, but this feature is not implemented yet.");
}
