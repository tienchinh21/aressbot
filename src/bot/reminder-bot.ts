import { Bot } from "grammy";

type Reminder = {
  id: number;
  chatId: number;
  userId: number;
  message: string;
  when: Date;
  timeout: NodeJS.Timeout;
};

export const startReminderBot = (token: string): Bot => {
  const bot = new Bot(token);
  const remindersByUser = new Map<number, Reminder[]>();
  let reminderId = 1;

  const addReminder = (reminder: Reminder): void => {
    const list = remindersByUser.get(reminder.userId) ?? [];
    list.push(reminder);
    remindersByUser.set(reminder.userId, list);
  };

  const removeReminder = (userId: number, id: number): boolean => {
    const list = remindersByUser.get(userId) ?? [];
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return false;

    const [removed] = list.splice(index, 1);
    clearTimeout(removed.timeout);
    remindersByUser.set(userId, list);
    return true;
  };

  bot.command("start", (ctx) => ctx.reply("Xin chao! Go /help de xem lenh."));

  bot.command("help", (ctx) =>
    ctx.reply(
      "/start - Bat dau\n/help - Tro giup\n/ping - Kiem tra bot\n/remind <phut> <noi dung> - Nhac viec\n/reminders - Danh sach nhac viec\n/cancel <id> - Huy nhac viec"
    )
  );

  bot.command("ping", (ctx) => ctx.reply("pong"));

  bot.command("remind", (ctx) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    const args = ctx.message?.text?.split(" ").slice(1) ?? [];
    if (args.length < 2) {
      return ctx.reply("Dung: /remind <phut> <noi dung>");
    }

    const minutes = Number(args[0]);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return ctx.reply("So phut phai la so duong.");
    }

    const message = args.slice(1).join(" ").trim();
    if (!message) {
      return ctx.reply("Noi dung nhac viec khong duoc trong.");
    }

    const when = new Date(Date.now() + minutes * 60 * 1000);
    const id = reminderId++;
    const timeout = setTimeout(() => {
      void bot.api.sendMessage(chatId, `Nhac viec: ${message}`);
      removeReminder(userId, id);
    }, minutes * 60 * 1000);

    addReminder({ id, chatId, userId, message, when, timeout });

    return ctx.reply(`Da dat nhac viec #${id} luc ${when.toLocaleTimeString()}.`);
  });

  bot.command("reminders", (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const list = remindersByUser.get(userId) ?? [];
    if (list.length === 0) {
      return ctx.reply("Chua co nhac viec nao.");
    }

    const lines = list
      .sort((a, b) => a.when.getTime() - b.when.getTime())
      .map((item) => `#${item.id} - ${item.when.toLocaleTimeString()} - ${item.message}`);

    return ctx.reply(lines.join("\n"));
  });

  bot.command("cancel", (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(" ").slice(1) ?? [];
    const id = Number(args[0]);
    if (!Number.isFinite(id)) {
      return ctx.reply("Dung: /cancel <id>");
    }

    const ok = removeReminder(userId, id);
    return ctx.reply(ok ? `Da huy #${id}.` : `Khong tim thay #${id}.`);
  });

  bot.start();
  return bot;
};
