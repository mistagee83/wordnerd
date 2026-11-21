// Firestore and Storage rules are shared with the EdTech Hub (project mrashub)
// and are owned by the Hub repo (D:\dev\Edtechhub). This repo keeps copies only
// for the local emulators. This predeploy hook stops any deploy that would overwrite them.
const target = process.argv[2] ?? 'this target';
console.error(
  `\n[WordNerd] Deploying ${target} rules from this repo is blocked.\n` +
  `           ${target} rules are owned by the Hub repo. Change and deploy them from there.\n` +
  `           Use: firebase deploy --only functions:wordnerd\n`
);
process.exit(1);
