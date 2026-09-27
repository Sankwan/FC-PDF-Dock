import http from "node:http";
import { config, assertProductionConfig } from "./config.js";
import { openDb } from "./db.js";
import { createMailer } from "./mailer.js";
import { createApp } from "./app.js";

if (process.env.NODE_ENV === "production") assertProductionConfig();
else if (!config.secret) console.warn("[config] AUTH_SECRET not set; using an insecure development secret.");

if (config.demo) console.warn(`[config] Demo login on: ${config.demo.email} always gets code ${config.demo.code}. Local use only.`);

const store = openDb(config.dbFile);
const mailer = createMailer(config.mail);
const server = http.createServer(createApp({ config, store, mailer }));

store.prune();
setInterval(store.prune, 15 * 60_000).unref();

server.listen(config.port, config.host, () => {
  console.log(`[auth] listening on ${config.host}:${config.port} (mail: ${config.mail.mode}, domain: @${config.emailDomain})`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
