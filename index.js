import ora from "ora";
import chalk from "chalk";
import clear from "console-clear";
import figlet from "figlet";
import qrcode from "qrcode-terminal";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs-extra";
import emojiRegex from "emoji-regex";

const logger = pino({
  level: "silent",
});

const spinner = ora("Starting...").start();

const showBanner = () => {
  clear();

  const program_name = "Hidetag Whatsapp";

  const author = chalk.yellow("Author: ") + chalk.yellowBright("Ihsan Devs\n");

  const howToUseEn =
    chalk.magenta.bold("How to use:\n") +
    chalk.blueBright(
      `Once the QR code is scanned and connected to your WhatsApp account, you can send any text message.
To trigger the hidetag, send a message to a group containing any emoji.\n`
    );

  const howToUseId =
    chalk.magenta.bold("Cara pakai:\n") +
    chalk.blueBright(
      `Setelah kode QR di-scan dan telah terhubung ke akun whatsapp kamu, kamu bisa mengirim pesan text apapun.
Untuk mentrigger hidetag, kirim pesan ke sebuah grup dengan mengandung emoji apa saja.\n`
    );

  const banner = chalk.magentaBright(figlet.textSync(program_name));

  console.log(banner);

  console.log(author);

  console.log(howToUseEn);

  console.log(howToUseId);

  console.log("\n\n");
};

const whatsapp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(".auth_sessions");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ["Ihsan Devs", "Chrome", "20.0.04"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      showBanner();
      spinner.stop();
      chalk.magentaBright(
        qrcode.generate(qr, {
          small: true,
        })
      );

      spinner.start("Please scan the QR Code...");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;

      const loggedOut =
        lastDisconnect.error?.output?.statusCode === DisconnectReason.loggedOut;

      const requiredRestart =
        lastDisconnect.error?.output?.statusCode ===
        DisconnectReason.restartRequired;
      spinner
        .warn(
          "connection closed due to ",
          lastDisconnect.error,
          ", reconnecting ",
          shouldReconnect
        )
        .start();

      if (loggedOut) {
        fs.emptyDirSync(".auth_sessions");
        showBanner();
        whatsapp();
        return;
      }

      // reconnect if not logged out
      if (shouldReconnect || requiredRestart) {
        showBanner();
        spinner.start("reconnecting...");
        whatsapp();
      }
    } else if (connection === "open") {
      spinner.succeed("opened connection").start("Waiting new message...");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (messages) => {
    if (
      messages.messages[0].key.fromMe &&
      messages.messages[0].key.remoteJid.includes("@g.us")
    ) {
      const message = messages.messages[0];

      const groupJid = message.key.remoteJid;

      const group = await sock.groupMetadata(groupJid);

      const groupParticipants = group.participants;

      const groupName = group.subject;

      //   console.log(
      //     message,
      //     groupParticipants.map((item) => item.id)
      //   );

      if (
        message.message.extendedTextMessage?.text ||
        message.message.conversation
      ) {
        let textMessage =
          message.message.extendedTextMessage?.text ||
          message.message.conversation;

        let emojies;
        try {
          emojies = textMessage.match(
            /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu
          );

          if (emojies.length > 0) {
            spinner
              .info(
                `New hidetag message requested into group: ${chalk.underline.bold.yellowBright(
                  groupName
                )} (${
                  groupParticipants.length
                } participants)\nHidetag message: ${textMessage}\n\n`
              )
              .start();

            // edit message, then mentions all participants.
            sock.sendMessage(groupJid, {
              text: textMessage,
              edit: message.key,
              mentions: groupParticipants.map((item) => item.id),
            });
          }
        } catch (error) {
          spinner
            .fail(
              `Failed to send message using hidetag. Error: ${error.toString()}`
            )
            .start();
        }
      }

      if (message.message.imageMessage?.caption) {
        let textMessage = message.message.imageMessage?.caption;

        let emojies;
        try {
          emojies = textMessage.match(
            /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu
          );

          if (emojies.length > 0) {
            spinner
              .info(
                `New hidetag image message: ${textMessage} requested into group: ${chalk.underline.bold.yellowBright(
                  groupName
                )} (${
                  groupParticipants.length
                } participants)\nHidetag message: ${textMessage}\n\n`
              )
              .start();

            // edit message, then mentions all participants.
            sock.sendMessage(groupJid, {
              image: message.message.imageMessage,
              caption: textMessage,
              edit: message.key,
              mentions: groupParticipants.map((item) => item.id),
            });
          }
        } catch (error) {
          spinner
            .fail(
              `Failed to send message using hidetag. Error: ${error.toString()}`
            )
            .start();
        }
      }
    }
  });
};

showBanner();

whatsapp();
