const fs = require('fs');
const file = 'c:/Users/evg/WebstormProjects/apk/aiternitas/server/agents/WorkerAgent.mjs';
let c = fs.readFileSync(file, 'utf8');

c = c.replace('3. "bash_execute" - запуск консольной команды в корне проекта.', '3. "bash_execute" - запуск консольной команды в Docker-песочнице (Linux-контейнер).');

c = c.replace("Ты работаешь на ОС Windows (используй PowerShell/CMD команды, если нужно). Рабочая директория: ${process.cwd()}", "Скрипты (bash_execute) выполняются в изолированной Linux-песочнице (Docker) в папке /workspace. Рабочая директория хоста проецируется в /workspace.");

const bashExecOld = `       case 'bash_execute':
          const forbidden = ['rm -rf', 'del /s /q', 'format', 'shutdown', 'mkfs'];
          if (forbidden.some(cmd => args.command.toLowerCase().includes(cmd))) {
             return 'TOOL ERROR: Command forbidden for security reasons.';
          }
          const { stdout, stderr } = await execPromise(args.command, { cwd: process.cwd() });
          return \`STDOUT:\\n${stdout}\\nSTDERR:\\n${stderr}\`;`;

const bashExecNew = `       case 'bash_execute':
          const forbidden = ['rm -rf', 'format', 'shutdown', 'mkfs'];
          if (forbidden.some(cmd => args.command.toLowerCase().includes(cmd))) {
             return 'TOOL ERROR: Command forbidden for security reasons.';
          }
          const crypto = require('crypto');
          const scriptName = \`/workspace/.temp_exec_${crypto.randomBytes(4).toString('hex')}.sh\`;
          const tempScriptPath = require('path').join(process.cwd(), scriptName.replace('/workspace/', ''));
          await fs.promises.writeFile(tempScriptPath, args.command, 'utf8');
          let stdout, stderr;
          try {
            const dockerCmd = \`docker run --rm -v "${process.cwd()}:/workspace" -w /workspace node:18-alpine sh ${scriptName}`;
            const result = await execPromise(dockerCmd);
            stdout = result.stdout;
            stderr = result.stderr;
          } catch(err) {
            stdout = err.stdout || '';
            stderr = err.stderr || err.message;
          } finally {
            await fs.promises.unlink(tempScriptPath).catch(() => {});
          }
          return \`STDOUT:\\n${stdout}\\nSTDERR:\\n${stderr}\`;`;

c = c.replace(bashExecOld, bashExecNew);
fs.writeFileSync(file, c, 'utf8');
console.log('Update complete.');