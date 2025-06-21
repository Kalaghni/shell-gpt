// src/electron/api.ts

import {nativeTheme, ipcMain, IpcMainInvokeEvent, BrowserWindow, TitleBarOverlayOptions} from "electron";

import settings from 'electron-settings';
import {DockerShell} from "./shell";
import createAi from "./gpt";
import { ShellContent } from "@/types/shell";
import { SettingValues } from "@/types/settings";
import {ChatGPTAPI, ChatGPTError} from "chatgpt";

export function getColors(): Partial<TitleBarOverlayOptions> {
    return nativeTheme.shouldUseDarkColors ? {
        color: '#030712',
        symbolColor: '#F9FAFB'
    } : {
        color: '#FFFFFF',
        symbolColor: '#030712'
    }
}

ipcMain.handle(
    "set-theme",
    (_event: IpcMainInvokeEvent, theme:  "system" | "light" | "dark") => {
        nativeTheme.themeSource = theme;

        BrowserWindow.getAllWindows().forEach(win => {
            win.setTitleBarOverlay({
                ...getColors(),
                height: 55
            })
        })
    }
);

nativeTheme.on('updated', function () {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('system-theme', nativeTheme.themeSource)
    })
});

const delay = (t: number) => new Promise(resolve => setTimeout(resolve, t));


let parent_id: string;

let dockerShell: DockerShell|null = null;

ipcMain.handle('save-settings', async function (_event, values: SettingValues) {
    return await settings.set('apiKey', values.apiKey);
});

ipcMain.handle('get-settings', async function () {
    return (await settings.get()) ?? {} as Partial<SettingValues>;
})

ipcMain.handle('true-shell', async (_event, message: string) => {

    if (dockerShell) dockerShell.cleanup();

    dockerShell = new DockerShell('ubuntu');

    function sendShellMessage(message: ShellContent) {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('shell-content', message)
        })
    }

    const mainWindow = BrowserWindow.getAllWindows()[0];

    await dockerShell.startShell(
        (data) => mainWindow?.webContents.send('shell-output', data),
        (err) => mainWindow?.webContents.send('shell-error', err),
        (code) => mainWindow?.webContents.send('shell-exit', code)
    );

    await dockerShell.sendCommand(message)
        .then((output) => {
            sendShellMessage({
                message: output,
                who: 'user',
                event: 'done',
                status: 'OK'
            })
        })
        .catch((err) => {
            sendShellMessage({
                message: err,
                who: 'user',
                event: 'done',
                status: 'ERR'
            })
        })
})



function allLinesAreComments(text: string): boolean {
    return text
        .split('\n')                          // split into lines
        .map(line => line.trim())             // trim each line
        .filter(line => line !== '')          // ignore empty lines
        .every(line => line.startsWith('#')); // check each non-empty line
}
export function initShell(_dockerShell: DockerShell|null) {

    dockerShell = _dockerShell;

    let stopped = false;

    function sendShellMessage(message: ShellContent) {
        if (stopped) {
            return;
        }
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('shell-content', message)
        })
    }
    
    function handleStop(message: ShellContent) {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('shell-content', {
                message: `Killed: ${message.message}`,
                who: message.who,
                status: 'TERM',
                event: 'done'
            })
        });
    }

    ipcMain.handle('shell-stop', () => {
        stopped = true;
    })

    ipcMain.handle('shell-start', async (_event, GOAL, IMAGE_NAME: string) => {

        let msg: ShellContent;
        let ai: ChatGPTAPI;

        const shellPrompt = `You are a command-line assistant. Your response will be pasted directly into a terminal running on a ${process.platform} system.

/* INSTRUCTIONS – follow strictly:
- Your ONLY task is to start an interactive shell inside a Docker container. DO NOT run or configure any application code.
- Output ONLY a single valid shell command — no prose, no explanations, no markdown formatting.
- The goal is: ${GOAL}
- The image to use is: ${IMAGE_NAME}
- Use /bin/bash if available, otherwise fallback to /bin/sh

Command requirements:
- Start a Docker container using the image: ${IMAGE_NAME}
- Name the container: temp-shell
- Automatically remove the container on exit (use --rm)
- Expose any ports that would be needed for ${GOAL}, even if they won't be used yet
- Use only \`-i\` (interactive), DO NOT include \`-t\` or \`-it\`
- DO NOT run any setup or app code — the only purpose is to land in an interactive shell

Formatting rules:
- The response must be a single shell command on one line
- DO NOT include \` \`\`\`bash \`, bullet points, comments, or explanation text

Return ONLY the \`docker run\` command — nothing else.
*/`;

        try {
            const value = await settings.get('apiKey') as string;
            ai = createAi(value, {
                systemMessage: shellPrompt,
                maxResponseTokens: 100,
                maxModelTokens: 100
            });
        }
        catch (error) {
            return error as Error;
        }

        if (dockerShell) dockerShell.cleanup();

        dockerShell = new DockerShell(IMAGE_NAME);



        console.log(shellPrompt)

        const dockerResponse = await ai.sendMessage(shellPrompt, {
            onProgress: function (progress) {
                sendShellMessage(msg = {
                    message: progress.text,
                    who: 'GPT',
                    status: "OK",
                    event: 'partial'
                })
            }
        })

        parent_id = dockerResponse.id;

        msg = {
            message: dockerResponse.text,
            who: 'GPT',
            status: "OK",
            event: 'done'
        }

        if (stopped) return handleStop(msg);

        sendShellMessage(msg)

        const spawnArgs = dockerResponse.text.replace('\n', '').split(' ');

        console.log(spawnArgs)

        await delay(1000);

        if (stopped) return handleStop(msg);

        const shellInit = await dockerShell.startShell(
            (chunk) => sendShellMessage({
                message: chunk,
                who: 'Shell',
                status: "OK",
                event: 'partial'
            }),
            () => {
            },
            (code) => sendShellMessage({
                message: code?.toString() ?? '',
                who: 'Shell',
                status: "TERM",
                event: 'done'
            }),
            spawnArgs
        );
        msg = {
            message: shellInit,
            who: 'Shell',
            status: "OK",
            event: 'done'
        }
        if (stopped) return handleStop(msg);

        sendShellMessage(msg)

        const goalPrompt = `You are a command-line assistant. You will respond as if your output is being pasted directly into a ${IMAGE_NAME} terminal.
Instructions:
- DO NOT include any prose or markdown formatting — plain terminal-safe text only.
- Begin by working toward: ${GOAL}.
- Output only ONE command at a time, then pause for output. If necessary, respond with:
  # Please run the above and paste the output so I can continue.
- Use only valid syntax for ${IMAGE_NAME}.
- The environment has already been created with the command: \`${shellPrompt}\`. Do not run any Docker commands or repeat any Docker-related setup (such as mounting, networking, or container creation); assume you are already inside the running container with all required mounts and settings applied.
- Include inline comments (#) when helpful, but no external explanations.
- Do NOT run any command that would require user input (e.g. editors, prompts, menus, or anything that waits for user interaction).
- Do NOT start any servers, background services, daemons, or long-running processes.
- The output of each shell command will be automatically prefixed with OK (if the command succeeded) or ERR (if the command failed). You should use this prefix to determine whether to continue, retry, or stop if an error occurs.
- Before installing or configuring any software, you must:
  - Make a web request or query the appropriate API to verify the latest available version and ensure the package or tool is not deprecated or broken.
  - Install only the latest stable (non-deprecated) version, using official sources or repositories.
  - Check system compatibility (e.g. architecture, OS version).
  - Verify required versions and dependency compatibility.
  - Avoid conflict with any running services.
- Monitor system resources:
  - Check memory and storage usage when relevant.
  - Avoid commands that may cause exhaustion or instability.
- Use \`sudo\` only when clearly required. Do not assume root access.
- Continue sending single-step commands until the goal is fully accomplished or confirmed impossible.
- Once the goal is fully complete, output ONLY a shell comment (starting with #) asking: "What is the next goal?"`;


        ai = createAi((await settings.get('apiKey')) as string, {
            systemMessage: goalPrompt,
        })

        console.log(goalPrompt);
        await delay(1000);

        if (stopped) return handleStop(msg);

        const response = await ai.sendMessage("", {
            onProgress: (partialResponse) => {
                sendShellMessage(msg = {
                    who: "GPT",
                    event: 'partial',
                    message: partialResponse.text,
                    status: "OK"
                })
            },
        });

        console.log(response.text)

        parent_id = response.id;
        msg = {
            who: "GPT",
            event: 'done',
            message: response.text,
            status: 'OK'
        };
        sendShellMessage(msg)
        await delay(1000);

        if (stopped) return handleStop(msg);

        const shellFullOutput = await dockerShell?.execute(response.text, function (progress) {
            sendShellMessage(msg = {
                message: progress,
                who: 'Shell',
                event: 'partial',
                status: 'OK'
            })
        });
        msg = {
            who: "Shell",
            event: "done",
            message: shellFullOutput.text,
            status: shellFullOutput.status ? 'OK' : 'ERR'
        }
        sendShellMessage(msg)
        await delay(1000);

        if (stopped) return handleStop(msg);

        // Send command to shell
        ipcMain.handle('shell-send', (_event, message) => {
            stopped = false;
            gptMessage(message)
        });

        await gptMessage((shellFullOutput.status ? "OK" : "ERR") + ": " + shellFullOutput.text);


        async function gptMessage (shellMessage: string) {

            try {
                const res = await ai.sendMessage(shellMessage, {
                    parentMessageId: parent_id,
                    onProgress: (partialResponse) => {
                        sendShellMessage(msg = {
                            who: "GPT",
                            event: 'partial',
                            message: partialResponse.text,
                            status: 'OK'
                        })
                    }
                });

                sendShellMessage(msg = {
                    who: "GPT",
                    event: 'done',
                    message: res.text,
                    status: 'OK'
                })

                if (stopped) return handleStop(msg);


                parent_id = res.id;

                if (res.text.includes("# Please run the above and paste the output so I can continue.")) {
                    return;
                }

                if (allLinesAreComments(res.text)) {
                    return;
                }

                const shellOut = await dockerShell!.execute(res.text, function (progress) {
                    sendShellMessage(msg = {
                        who: "Shell",
                        event: 'partial',
                        message: progress,
                        status: 'OK'
                    })
                })

                if (stopped) return handleStop(msg);
                sendShellMessage(msg = {
                    who: "Shell",
                    event: 'done',
                    message: shellOut.text,
                    status: shellOut.status ? 'OK' : 'ERR'
                })

                await delay(1000);

                if (stopped) return handleStop(msg);

                await gptMessage((shellOut.status ? "OK" : "ERR") + ": " + shellOut.text);
            }
            catch (err) {
                const error = err as ChatGPTError;


                sendShellMessage(msg = {
                    who: "GPT",
                    event: 'done',
                    message: error.message,
                    status: 'WARN'
                })
                if (error.statusCode === 429) {
                    await delay(10000);

                    await gptMessage(shellMessage)
                }
            }
        }
    });

    return dockerShell;
}




