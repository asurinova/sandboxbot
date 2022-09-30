import TelegramBot from "node-telegram-bot-api";
import MongoConnection from "./modules/MongoConnection";
import { IUser } from "./modules/interfaces";
import { rmSync, writeFileSync } from "fs";
import { URL } from "url";

import dotenv from "dotenv";
dotenv.config();

const dbConnection = new MongoConnection(process.env.DB_URL!);

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
    await sleep(500);
    const bot = new TelegramBot(process.env.BOT_TOKEN!, { polling: true });

    async function showProfile(tgId: number) {
        const text = await getProfileText(tgId);
        bot.sendMessage(tgId, text, {
            reply_markup: {
                inline_keyboard: profileKeyboard,
            },
        });
    }

    async function showProfileInline(tgId: number, message_id: number) {
        const text = await getProfileText(tgId);
        bot.editMessageText(text, {
            chat_id: tgId,
            message_id,
            reply_markup: {
                inline_keyboard: profileKeyboard,
            },
        });
    }

    bot.onText(/\/start/, async (msg) => {
        const db = dbConnection.db("sandboxbot");
        const res = (await db
            ?.collection("users")
            .findOne({ tgId: msg.chat.id })) as IUser;
        if (!res) {
            bot.sendMessage(
                msg.chat.id,
                "❗️Добро пожаловать\n⚠️ Укажите ссылку на Ваш профиль Lolzteam"
            );
            db?.collection("users")
                .insertOne({
                    tgId: msg.chat.id,
                    activeState: "REG_NICK",
                })
                .then((res1) => console.log(res1));
            return;
        }

        if (res.activeState == "WAIT_ACCESS")
            bot.sendMessage(
                msg.chat.id,
                "📨 Заявка была отправлена, ожидайте рассмотрения"
            );
        else if (res.activeState == "ACTIVATED") showProfile(msg.chat.id);
    });

    bot.onText(/\/msg (\d+) (.+)/, async (msg, match) => {
        if (msg.chat.id != Number(process.env.BOT_GROUP_ID!)) return;

        await bot.sendMessage(match![1], match![2]);
        bot.sendMessage(msg.chat.id, "Сообщение отправлено");
    });

    bot.onText(/\/ban (\d+)/, async (msg, match) => {
        if (msg.chat.id != Number(process.env.BOT_GROUP_ID!)) return;

        const tgId = Number(match![1]);
        if (Number.isNaN(tgId))
            return bot.sendMessage(msg.chat.id, "Некорректный ид");

        const db = dbConnection.db("sandboxbot");
        const result = await db
            ?.collection("users")
            .updateOne({ tgId }, { $set: { activeState: "BANNED" } });
        if (result?.modifiedCount == 0 || !result?.modifiedCount)
            return bot.sendMessage(msg.chat.id, "Не удалось забанить");

        bot.sendMessage(msg.chat.id, "Пользователь заблокирован");
        bot.sendMessage(tgId, "Вам ограничен доступ к боту");
    });

    bot.onText(/\/unban (\d+)/, async (msg, match) => {
        if (msg.chat.id != Number(process.env.BOT_GROUP_ID!)) return;

        const tgId = Number(match![1]);
        if (Number.isNaN(tgId))
            return bot.sendMessage(msg.chat.id, "Некорректный ид");

        const db = dbConnection.db("sandboxbot");
        const result = await db
            ?.collection("users")
            .updateOne({ tgId }, { $set: { activeState: "ACTIVATED" } });
        if (result?.modifiedCount == 0 || !result?.modifiedCount)
            return bot.sendMessage(msg.chat.id, "Не удалось разбанить");

        bot.sendMessage(msg.chat.id, "Пользователь разблокирован");
    });

    bot.onText(/\/profile (\d+)/, async (msg, match) => {
        console.log(msg.chat.id);
        console.log(process.env.BOT_GROUP_ID);
        console.log(process.env.MY_ID!);

        if (
            msg.chat.id != Number(process.env.BOT_GROUP_ID!) &&
            msg.chat.id != Number(process.env.MY_ID!)
        ) {
            console.log(msg.chat.id != Number(process.env.BOT_GROUP_ID!));
            console.log(msg.chat.id != Number(process.env.MY_ID!));

            return;
        }

        const db = dbConnection.db("sandboxbot");
        const id = Number(match![1]);
        const profile = (await db?.collection("users").findOne({
            tgId: id,
        })) as IUser;

        if (!profile)
            return bot.sendMessage(
                msg.chat.id,
                "Не удалось найти человека с таким Telegram ID"
            );
        let text = await getProfileText(id);
        text += `\n💸 Баланс: ${profile.balance}`;
        bot.sendMessage(msg.chat.id, text);
    });

    bot.onText(/\/setbalance (\d+) (\d+)/, async (msg, match) => {
        if (msg.chat.id != Number(process.env.MY_ID!)) return;

        const db = dbConnection.db("sandboxbot");
        await db?.collection("users").updateOne(
            { tgId: Number(match![1]) },
            {
                $set: { balance: Number(match![2]) },
            }
        );
        bot.sendMessage(msg.chat.id, "Баланс установлен");
    });

    bot.onText(/^\/members/, async (msg) => {
        if (msg.chat.id != Number(process.env.MY_ID!)) return;
        const db = dbConnection.db("sandboxbot");

        const all = (await db
            ?.collection("users")
            .find({
                activeState: { $in: ["ACTIVATED", "WAIT_ASK", "WITHDRAW_ASK"] },
            })
            .toArray()) as IUser[];
        let text = "";
        all?.forEach((el, index) => {
            text += `${index + 1}. ${el.lolzLink}, ${el.tgId}, ${new Date(
                el.activateDate!
            ).toLocaleString("ru-RU")}`;
        });

        writeFileSync("members.txt", text);

        bot.sendMessage(msg.chat.id, "Идет подготовка списка");
        await bot.sendDocument(msg.chat.id, "members.txt");
        rmSync("members.txt");
    });

    bot.onText(/^\/a (.+)/, async (msg, match) => {
        if (msg.chat.id != Number(process.env.MY_ID!)) return;
        const db = dbConnection.db("sandboxbot");

        const all = (await db
            ?.collection("users")
            .find({
                activeState: { $in: ["ACTIVATED", "WAIT_ASK", "WITHDRAW_ASK"] },
            })
            .toArray()) as IUser[];

        // let sleepTime = Date.now()
        let counter = 0;
        for (const user of all) {
            bot.sendMessage(user.tgId, match![1]);
            counter++;
            if (counter == 25) {
                counter = 0;
                await sleep(2000);
            }
        }
    });

    bot.onText(/^[^\/]/, async (msg) => {
        if (msg.chat.type == "private") {
            const db = dbConnection.db("sandboxbot");

            const res = (await db
                ?.collection("users")
                .findOne({ tgId: msg.chat.id })) as IUser;

            if (res.activeState == "BANNED") return;

            if (res.activeState == "REG_NICK") {
                try {
                    const url = new URL(msg.text!);
                    if (url.host != "lolz.guru") throw "error";

                    bot.sendMessage(
                        msg.chat.id,
                        "📈 Работали ли Вы в каких-либо тимах? (Указать опыт)"
                    );
                    db?.collection("users").updateOne(
                        { tgId: msg.chat.id },
                        {
                            $set: {
                                activeState: "REG_TEXT",
                                lolzLink: msg.text,
                            },
                        }
                    );
                } catch (e) {
                    bot.sendMessage(
                        msg.chat.id,
                        "🔴 Ошибка! Укажите ссылку формата https://lolz.guru/......."
                    );
                }

                return;
            }

            if (res.activeState == "REG_TEXT") {
                bot.sendMessage(
                    msg.chat.id,
                    "📨 Заявка была отправлена, ожидайте рассмотрения"
                );
                db?.collection("users").updateOne(
                    { tgId: msg.chat.id },
                    {
                        $set: {
                            activeState: "WAIT_ACCESS",
                            desc: msg.text,
                        },
                    }
                );
                const buttons = [
                    [
                        {
                            text: "✅ Одобрить",
                            callback_data: JSON.stringify({
                                action: "accept",
                                tgId: msg.chat.id,
                            }),
                        },
                        {
                            text: "❌ Отклонить",
                            callback_data: JSON.stringify({
                                action: "decline",
                                tgId: msg.chat.id,
                            }),
                        },
                    ],
                    [
                        {
                            text: "🚷 Заблокировать",
                            callback_data: JSON.stringify({
                                action: "ban",
                                tgId: msg.chat.id,
                            }),
                        },
                    ],
                ];
                bot.sendMessage(
                    process.env.BOT_GROUP_ID!,
                    `📯 Новая заявка в команду!\n\n👤 Пользователь:\n└ Telegram ID: ${msg.chat.id}\n\n🏷 Форумник:\n└ Ссылка на профиль: ${res.lolzLink}\n\n🔖 Информация:\n└ Опыт работы: ${msg.text}`,
                    {
                        reply_markup: { inline_keyboard: buttons },
                        disable_web_page_preview: true,
                    }
                );
                return;
            }

            if (res.activeState == "WAIT_ASK") {
                db?.collection("users").updateOne(
                    { tgId: msg.chat.id },
                    {
                        $set: {
                            activeState: "ACTIVATED",
                        },
                    }
                );
                bot.sendMessage(
                    msg.chat.id,
                    "⏳В скором времени модерация ответит на Ваш вопрос."
                );
                const res = await bot.forwardMessage(
                    process.env.BOT_GROUP_ID!,
                    msg.chat.id,
                    msg.message_id
                );
                bot.onReplyToMessage(
                    res.chat.id,
                    res.message_id,
                    async (message) => {
                        if (message.text)
                            bot.sendMessage(msg.chat.id, message.text, {
                                reply_to_message_id: msg.message_id,
                            });
                    }
                );
            }

            if (res.activeState == "WITHDRAW_ASK") {
                const res = (await db
                    ?.collection("users")
                    .findOne({ tgId: msg.chat.id })) as IUser;
                if (msg.chat.username) {
                    bot.sendMessage(
                        process.env.BOT_GROUP_ID!,
                        `@${msg.chat.username} запросил выплату на ${res.withdrawMethod}:\n\n${msg.text}`
                    );
                    await bot.sendMessage(
                        msg.chat.id,
                        `Запрос на вывод средств оформлен. Не изменяйте ник телеграма до получения выплаты, иначе в случае возникновения проблем с вами не смогут связаться. Текущий ник: @${msg.chat.username}`
                    );
                } else {
                    await bot.sendMessage(
                        msg.chat.id,
                        "Для запроса выплаты настройте username телеграма"
                    );
                }

                db?.collection("users").updateOne(
                    {
                        tgId: msg.chat.id,
                    },
                    {
                        $set: { activeState: "ACTIVATED" },
                        $unset: { withdrawMethod: 1 },
                    }
                );
                showProfile(msg.chat.id);
            }
        }
    });

    bot.on("callback_query", async (query) => {
        const db = dbConnection.db("sandboxbot");
        const data = JSON.parse(query.data!);

        console.log(query);

        if (query.message?.chat.id == process.env.BOT_GROUP_ID) {
            let newText = query.message?.text! + "\n\n";

            let keyboard: TelegramBot.InlineKeyboardButton[][] = [[]];

            const date = new Date();

            switch (data.action) {
                case "accept":
                    db?.collection("users").updateOne(
                        { tgId: data.tgId },
                        {
                            $set: {
                                activeState: "ACTIVATED",
                                activateDate: date,
                                balance: 0,
                            },
                        }
                    );
                    bot.sendMessage(
                        data.tgId,
                        "✅ Заявка была одобрена, добро пожаловать в команду!\nОбязательно ознакомьтесь с мануалом и правилами в разделе основное."
                    );
                    showProfile(data.tgId);
                    newText += `🟢 Заявка была одобрена ${
                        query.from.first_name
                    }, ${date.toLocaleString("ru-RU")}`;
                    break;
                case "decline":
                    db?.collection("users").deleteOne({ tgId: data.tgId });
                    bot.sendMessage(
                        data.tgId,
                        "🔴 Ваша заявка была отклонена. Если у вас имеются вопросы, пожалуйста, обратитесь к @asurinovacom"
                    );
                    newText += `🔴 Заявка была отклонена ${
                        query.from.first_name
                    }, ${date.toLocaleString("ru-RU")}`;
                    break;
                case "ban":
                    db?.collection("users").updateOne(
                        { tgId: data.tgId },
                        {
                            $set: {
                                activeState: "BANNED",
                            },
                        }
                    );
                    bot.sendMessage(
                        data.tgId,
                        "Вам был ограничен доступ к боту"
                    );
                    newText += `человек был забанен ${date.toLocaleString(
                        "ru-RU"
                    )}`;
                    break;
                case "giveAccount":
                    db?.collection("users").updateOne(
                        { tgId: data.tgId },
                        {
                            $set: {
                                waitForAccount: false,
                            },
                        }
                    );
                    bot.sendMessage(
                        data.tgId,
                        "Ваш запрос на получение аккаунта успешно обработан"
                    );
                    newText += `Заявка была одобрена ${
                        query.from.first_name
                    } ${new Date().toLocaleString("ru-RU")}`;
                    break;
                case "notAccount":
                    db?.collection("users").updateOne(
                        { tgId: data.tgId },
                        {
                            $set: {
                                waitForAccount: false,
                            },
                        }
                    );
                    bot.sendMessage(
                        data.tgId,
                        "Ваш запрос на получение аккаунта отклонен"
                    );
                    newText += `Заявка была отклонена ${
                        query.from.first_name
                    } ${new Date().toLocaleString("ru-RU")}`;
                    break;
                case "processingAccount":
                    bot.sendMessage(
                        data.tgId,
                        "Ваш запрос на получение аккаунта обрабатывается"
                    );
                    keyboard = [
                        [
                            {
                                text: "Выдал аккаунт",
                                callback_data: JSON.stringify({
                                    action: "giveAccount",
                                    tgId: data.tgId,
                                }),
                            },
                            {
                                text: "Отказал в выдаче",
                                callback_data: JSON.stringify({
                                    action: "notAccount",
                                    tgId: data.tgId,
                                }),
                            },
                        ],
                    ];
                    newText += `Заявка обрабатывается ${query.from.first_name}`;
                    break;
            }

            let newMessageData: TelegramBot.EditMessageTextOptions = {
                message_id: query.message?.message_id,
                chat_id: query.message?.chat.id,
            };

            if (keyboard[0].length > 0)
                newMessageData = {
                    ...newMessageData,
                    reply_markup: {
                        inline_keyboard: keyboard,
                    },
                };
            bot.editMessageText(newText, newMessageData);
            return;
        }

        const tgId = query.message?.chat.id!;
        const user = (await db?.collection("users").findOne({ tgId })) as IUser;
        if (user.activeState == "BANNED") return;

        switch (data.action) {
            case "showInfo":
                bot.editMessageText(
                    "📩 Телеграмм чат воркеров:  https://t.me/+dQj2co0tKaU0ZjBi\n✉️ Телеграмм канал воркеров: https://t.me/+qaSNe3Ngc2w0NDYy\n💌 Мануал: https://anastasia-surinova.gitbook.io/sandbox-work-by-asurinova./",
                    {
                        message_id: query.message?.message_id,
                        chat_id: query.message?.chat.id,
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Получить аккаунт",
                                        callback_data: JSON.stringify({
                                            action: "getAccount",
                                            tgId,
                                        }),
                                    },
                                    gotoMain,
                                ],
                            ],
                        },
                    }
                );
                break;
            case "gotoMain":
                showProfileInline(tgId, query.message?.message_id!);
                break;
            case "getAccount":
                if (!query.message?.chat.username)
                    return bot.sendMessage(
                        tgId,
                        "Для подачи заявки настройте username в настройках пользователя"
                    );

                if (user.waitForAccount) {
                    await bot.editMessageText(
                        "Вы уже подали заявку на получение аккаунта",
                        {
                            chat_id: tgId,
                            message_id: query.message.message_id,
                        }
                    );
                    showProfile(tgId);
                    return;
                }

                db?.collection("users").updateOne(
                    { tgId },
                    {
                        $set: { waitForAccount: true },
                    }
                );

                bot.editMessageText("Заявка на получение аккаунта подана", {
                    chat_id: tgId,
                    message_id: query.message?.message_id,
                });
                showProfile(tgId);
                bot.sendMessage(
                    process.env.BOT_GROUP_ID!,
                    `@${query.message.chat.username} (${query.message?.chat?.id}) подал заявку на получение аккаунта`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Выдал аккаунт",
                                        callback_data: JSON.stringify({
                                            action: "giveAccount",
                                            tgId: query.message.chat.id,
                                        }),
                                    },
                                    {
                                        text: "Отказал в выдаче",
                                        callback_data: JSON.stringify({
                                            action: "notAccount",
                                            tgId: query.message.chat.id,
                                        }),
                                    },
                                    {
                                        text: "Обработка",
                                        callback_data: JSON.stringify({
                                            action: "processingAccount",
                                            tgId: query.message.chat.id,
                                        }),
                                    },
                                ],
                            ],
                        },
                    }
                );

                break;
            case "balance":
                let keyboard: TelegramBot.InlineKeyboardButton[] = [];
                if (user.balance! > 0)
                    keyboard = [
                        {
                            text: "Запросить выплату",
                            callback_data: JSON.stringify({
                                action: "withdrawSelect",
                            }),
                        },
                    ];
                keyboard = [...keyboard, gotoMain];
                bot.editMessageText(`💸 Ваш баланс: ${user.balance} рублей`, {
                    message_id: query.message?.message_id,
                    chat_id: query.message?.chat.id,
                    reply_markup: {
                        inline_keyboard: [keyboard],
                    },
                });
                break;
            case "withdrawSelect":
                if (!query.message?.chat.username) {
                    bot.editMessageText(
                        "Для запроса выплаты настройте username телеграма",
                        {
                            chat_id: tgId,
                            message_id: query.message?.chat.id,
                        }
                    );
                    showProfile(tgId);
                }
                bot.editMessageText("Выберите метод вывода", {
                    chat_id: tgId,
                    message_id: query.message?.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Qiwi",
                                    callback_data: JSON.stringify({
                                        action: "enterWithdraw",
                                        method: "qiwi",
                                    }),
                                },
                                {
                                    text: "YooMoney",
                                    callback_data: JSON.stringify({
                                        action: "enterWithdraw",
                                        method: "yoomoney",
                                    }),
                                },
                                {
                                    text: "Карта",
                                    callback_data: JSON.stringify({
                                        action: "enterWithdraw",
                                        method: "card",
                                    }),
                                },
                                {
                                    text: "Crypto",
                                    callback_data: JSON.stringify({
                                        action: "enterWithdraw",
                                        method: "crypto",
                                    }),
                                },
                            ],
                            [gotoMain],
                        ],
                    },
                });
                break;

            case "enterWithdraw":
                let text = "";
                switch (data.method) {
                    case "qiwi":
                        text = "Введите номер счета Qiwi для вывода";
                        break;
                    case "yoomoney":
                        text = "Введите номер счета YooMoney для вывода";
                        break;
                    case "card":
                        text =
                            "Введите номер карты, название банка, Имя Фамилию получателя";
                        break;
                    case "crypto":
                        text = "тут хуй знает что надо вводить ждем сережу";
                        break;
                }
                text += " и сумму";
                bot.editMessageText(text, {
                    chat_id: tgId,
                    message_id: query.message?.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    ...gotoMain,
                                    callback_data: JSON.stringify({
                                        action: "cancelWithdraw",
                                    }),
                                },
                            ],
                        ],
                    },
                });
                db?.collection("users").updateOne(
                    { tgId },
                    {
                        $set: {
                            activeState: "WITHDRAW_ASK",
                            withdrawMethod: data.method,
                        },
                    }
                );
                break;
            case "cancelWithdraw":
                showProfileInline(tgId, query.message?.message_id!);
                db?.collection("users").updateOne(
                    { tgId },
                    {
                        $set: {
                            activeState: "ACTIVATED",
                        },
                        $unset: {
                            withdrawMethod: 1,
                        },
                    }
                );
                break;
            case "help":
                db?.collection("users").updateOne(
                    { tgId },
                    {
                        $set: {
                            activeState: "WAIT_ASK",
                        },
                    }
                );
                bot.editMessageText(
                    "📝 Напишите одним сообщением ваш вопрос и отправьте сообщение. ",
                    {
                        chat_id: tgId,
                        message_id: query.message?.message_id!,
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Главное меню",
                                        callback_data: JSON.stringify({
                                            action: "cancelHelp",
                                        }),
                                    },
                                ],
                            ],
                        },
                    }
                );
                break;
            case "cancelHelp":
                showProfileInline(tgId, query.message?.message_id!);
                db?.collection("users").updateOne(
                    { tgId },
                    {
                        $set: {
                            activeState: "ACTIVATED",
                        },
                    }
                );
                break;
            default:
                break;
        }
    });
})();

const profileKeyboard = [
    [
        {
            text: "🗒 Основное",
            callback_data: JSON.stringify({ action: "showInfo" }),
        },
        {
            text: "💳 Баланс",
            callback_data: JSON.stringify({ action: "balance" }),
        },
        {
            text: "📡 Тех. поддержка",
            callback_data: JSON.stringify({ action: "help" }),
        },
    ],
];

async function getProfileText(tgId: number): Promise<string> {
    const db = dbConnection.db("sandboxbot");
    const res = (await db?.collection("users").findOne({ tgId })) as IUser;
    let text = "👤 Личный кабинет";
    text += `\n\n♻️ Профиль Lolzteam: ${res.lolzLink}`;
    text += `\n🆔 Telegram ID: ${tgId}`;
    text += `\n🗓 Дата принятия в команду: ${new Date(
        res.activateDate!
    ).toLocaleString("ru-RU")}`;
    return text;
}

const gotoMain = {
    text: "Главное меню",
    callback_data: JSON.stringify({ action: "gotoMain" }),
};
