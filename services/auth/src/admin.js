// Small admin CLI for the MIS/IT unit. Run inside the container:
//
//   docker compose exec auth node src/admin.js count
//   docker compose exec auth node src/admin.js block   firstname.lastname@fc.gov.gh
//   docker compose exec auth node src/admin.js unblock firstname.lastname@fc.gov.gh
//   docker compose exec auth node src/admin.js delete  firstname.lastname@fc.gov.gh
//
// "block" signs the person out everywhere immediately. Usually not needed
// when someone leaves: closing their mailbox already stops new sign-ins.
// PDFDock keeps no record of who uses which tool, so there is nothing else
// to report.
import { config } from "./config.js";
import { openDb } from "./db.js";
import { normaliseEmail } from "./staff.js";

const { q } = openDb(config.dbFile);
const [cmd, arg] = process.argv.slice(2);

const need = () => {
  const email = normaliseEmail(arg);
  if (!email || !q.getUser.get(email)) {
    console.error(`No account for "${arg ?? ""}".`);
    process.exit(1);
  }
  return email;
};

switch (cmd) {
  case "count": {
    const rows = q.listUsers.all();
    console.log(`${rows.length} address(es) have signed in; ${rows.filter((u) => u.status !== "active").length} blocked.`);
    break;
  }
  case "block": {
    const email = need();
    q.setStatus.run("disabled", email);
    q.deleteUserSessions.run(email);
    console.log(`Blocked ${email} and signed them out everywhere.`);
    break;
  }
  case "unblock": {
    const email = need();
    q.setStatus.run("active", email);
    console.log(`Unblocked ${email}.`);
    break;
  }
  case "delete": {
    const email = need();
    q.deleteUser.run(email);
    console.log(`Deleted ${email}.`);
    break;
  }
  default:
    console.log("Usage: node src/admin.js count | block <email> | unblock <email> | delete <email>");
    process.exit(cmd ? 1 : 0);
}
