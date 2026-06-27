// build-macros.js
// Generates macros.json using your PAT (stored in GH_PAT)

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const REPO_OWNER = "MicahThePro";
const REPO_NAME = "GD-Macro-Collection";
const BRANCH = "main";

const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const TOKEN = process.env.GH_PAT;

if (!TOKEN) {
  console.error("❌ Missing GH_PAT environment variable.");
  process.exit(1);
}

async function github(url) {
  const res = await fetch(url, {
    headers: {
      "Authorization": `token ${TOKEN}`,
      "User-Agent": "macro-builder"
    }
  });

  if (!res.ok) {
    console.error(`GitHub API error ${res.status}: ${url}`);
    const text = await res.text();
    console.error(text);
    process.exit(1);
  }

  return res.json();
}

async function fetchDirectory(path = "") {
  return github(`${API_BASE}/contents/${path}?ref=${BRANCH}`);
}

async function fetchCommitTimestamps() {
  const commits = await github(`${API_BASE}/commits?per_page=100`);

  const map = new Map();

  for (const commit of commits) {
    const timestamp = new Date(commit.commit.committer.date).getTime();

    if (commit.files) {
      for (const file of commit.files) {
        if (file.filename.endsWith(".slc")) {
          map.set(file.filename, timestamp);
        }
      }
    }
  }

  return map;
}

function getMacroMetadata(filePath) {
  const parts = filePath.split("/");

  const group = parts[0];
  if (group === "main-levels") {
    return {
      path: filePath,
      group,
      subgroup: "",
      category: parts[1] || "",
      filename: parts.slice(2).join("/") || ""
    };
  }

  return {
    path: filePath,
    group,
    subgroup: parts[1] || "",
    category: parts[2] || "",
    filename: parts.slice(3).join("/") || ""
  };
}

async function walkRepo() {
  const macros = [];

  async function walk(dir = "") {
    const items = await fetchDirectory(dir);

    for (const item of items) {
      if (item.type === "dir") {
        await walk(item.path);
      } else if (item.type === "file" && item.name.endsWith(".slc")) {
        macros.push(getMacroMetadata(item.path));
      }
    }
  }

  await walk("");
  return macros;
}

async function main() {
  console.log("🔍 Scanning repo for macros...");
  const macroList = await walkRepo();

  console.log("🕒 Fetching commit timestamps...");
  const commitMap = await fetchCommitTimestamps();

  console.log("🧩 Attaching timestamps...");
  const finalList = macroList.map(m => ({
    ...m,
    lastModified: commitMap.get(m.path) || 0
  }));

  console.log("💾 Writing macros.json...");
  fs.writeFileSync(
    path.join(__dirname, "macros.json"),
    JSON.stringify(finalList, null, 2)
  );

  console.log("✅ Done! macros.json generated.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
