---
description: "Enable automatic session save on exit (Registers SessionEnd hook)"
allowed-tools: Bash, Read, Write
---

## Context
This command registers the `SessionEnd` lifecycle hook in the user's Claude Code configuration so that `/oh-my-obsidian:session-save` runs automatically whenever the Claude Code session ends. This is specifically useful for existing users who already ran `/oh-my-obsidian:setup` before the auto-hook feature was introduced, or if a user accidentally wiped their `.claude` configuration directory.

## Your Task

Execute the following Node.js code securely using your Bash tool (e.g., by writing to a temporary `inject-hook.js` file, running `node inject-hook.js`, and then deleting the file). This method avoids reliance on `jq` and ensures robust execution across Windows, Mac, and Linux:

```javascript
const fs = require("fs");
const path = require("path");
const os = require("os");
const file = path.join(os.homedir(), ".claude", "settings.json");
let data = {};
if (fs.existsSync(file)) {
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch(e){}
}
if (!data.hooks) data.hooks = {};
if (!data.hooks.SessionEnd) data.hooks.SessionEnd = [];
const cmd = "claude -p '/oh-my-obsidian:session-save'";
data.hooks.SessionEnd = data.hooks.SessionEnd.filter(h => !(h.hooks && h.hooks[0] && h.hooks[0].command === cmd));
data.hooks.SessionEnd.push({ matcher: "", hooks: [{ type: "command", command: cmd }] });
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2));
```

After executing the script successfully, print the following Korean success message:

```text
🎉 자동 저장 훅(SessionEnd Hook)이 성공적으로 등록되었습니다!

이제 실수로 터미널을 그냥 끄더라도, oh-my-obsidian이 백그라운드에서 현재 세션의 작업 내역과 의사결정 사항들을 옵시디언 볼트에 안전하게 자동 저장합니다. 코딩에만 집중하세요!
```
