// ─── scripts/hash.js ─────────────────────────────────────────────────────────
// Génère l'empreinte bcrypt d'un mot de passe, à coller dans les variables
// d'environnement de Render.
//
//   node scripts/hash.js
//
// Le mot de passe est saisi masqué, n'est jamais écrit sur disque, ne part
// nulle part, et n'apparaît pas dans l'historique du terminal.
import bcrypt from "bcryptjs";
import readline from "node:readline";

function demande(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Masque la frappe : on réécrit la ligne sans afficher les caractères.
    const onData = () => {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(question);
    };
    process.stdin.on("data", onData);
    rl.question(question, (rep) => {
      process.stdin.off("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(rep);
    });
  });
}

const mdp = await demande("Mot de passe : ");
if (!mdp || mdp.length < 8) {
  console.error("\n⚠︎  Trop court. Huit caractères minimum, et pas le nom du magasin.");
  process.exit(1);
}
console.log("\nEmpreinte à coller dans Render :\n");
console.log(bcrypt.hashSync(mdp, 12));
console.log("");
