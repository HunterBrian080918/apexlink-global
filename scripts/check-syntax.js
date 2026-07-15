const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const targets = [path.join(root, "server.js")];

const addJsFiles = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      addJsFiles(fullPath);
      continue;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".js") {
      targets.push(fullPath);
    }
  }
};

addJsFiles(path.join(root, "services"));
addJsFiles(path.join(root, "scripts"));
addJsFiles(path.join(root, "public"));

for (const filePath of targets) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${targets.length} file(s).`);
