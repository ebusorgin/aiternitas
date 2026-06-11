import { exec } from "child_process";

export default class AIService {

    constructor(options = {}) {
        this.model = options.model || "llama3.1:8b";
        this.history = [];
    }

    run(cmd) {
        return new Promise((resolve, reject) => {
            exec(cmd, (error, stdout, stderr) => {
                if (error) return reject(error);
                if (stderr) console.log("STDERR:", stderr);
                resolve(stdout);
            });
        });
    }

    async getModels() {
        const raw = await this.run("ollama list");

        const models = raw
            .split("\n")
            .slice(1)
            .filter(Boolean)
            .map(line => line.split(/\s+/)[0]);

        console.log("🧠 MODELS:", models);
        return models;
    }

    async ask(prompt, model = this.model) {
        console.log("🧠 ASK:", prompt,model);

        const safe = prompt.replace(/"/g, '\\"');

        const cmd = `echo "${safe}" | ollama run ${model}`;

        const output = await this.run(cmd);

        return output.toString().trim();
    }
}