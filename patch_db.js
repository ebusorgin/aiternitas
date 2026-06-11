const fs = require(\"fs\");

// 1. db.mjs - add sandbox tables
let db = fs.readFileSync(\"server/db.mjs\", \"utf8\");
if (!db.includes(\"sandbox_conversations\")) {
  const marker = \"console.log(\\x27✅ Таблица plugin_configs создана/проверена\\x27);\";
  const newTables = `
    await pool.query(\`
      CREATE TABLE IF NOT EXISTS sandbox_conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL DEFAULT \\\x27Новый чат\\\x27,
        model VARCHAR(100) NOT NULL DEFAULT \\\x27llama3\\\x27,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    \`);
    console.log(\"\u2705 \u0422\u0430\u0431\u043b\u0438\u0446\u0430 sandbox_conversations \u0441\u043e\u0437\u0434\u0430\u043d\u0430/\u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u0430\");
    await pool.query(\`
      CREATE TABLE IF NOT EXISTS sandbox_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES sandbox_conversations(id) ON DELETE CASCADE,
        sender VARCHAR(20) NOT NULL CHECK (sender IN (\\\x27user\\\x27, \\\x27agent\\\x27)),
        text TEXT NOT NULL,
        widget JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    \`);
    console.log(\"\u2705 \u0422\u0430\u0431\u043b\u0438\u0446\u0430 sandbox_messages \u0441\u043e\u0437\u0434\u0430\u043d\u0430/\u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u0430\");
`;
  if (db.includes(marker)) {
    db = db.replace(marker, marker + newTables);
    fs.writeFileSync("server/db.mjs", db);
    console.log("db.mjs updated");
  } else {
    console.log("marker not found, searching alternatives...");
    console.log(db.substring(db.indexOf("plugin_configs") - 50, db.indexOf("plugin_configs") + 100));
  }
} else {
  console.log("sandbox_conversations already exists in db.mjs");
}

