import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { randomBytes } from "crypto";

export class DockerShell {
    private shell: ChildProcessWithoutNullStreams | null = null;
    private containerId: string;
    private buffer: string = "";
    private pendingResolvers: {
        marker: string;
        resolve: (output: string) => void;
        reject: (err: Error) => void;
        output: string;
    }[] = [];

    constructor(containerId: string) {
        this.containerId = containerId;
    }

    async startShell(
        onData?: (data: string) => void,
        onError?: (data: string) => void,
        onExit?: (code: number | null) => void,
        spawnArgs?: string[]
    ): Promise<string> {
        this.cleanup();

        this.shell = spawn(
            spawnArgs ? spawnArgs[0] : "docker",
            spawnArgs
                ? spawnArgs.slice(1)
                : ["run", "-i", this.containerId, "/bin/bash"],
            { stdio: "pipe" }
        );

        let bootBuffer = "";
        let promptDetected = false;

        return new Promise<string>((resolve, reject) => {
            const onBootData = (data: Buffer) => {
                const chunk = data.toString();
                bootBuffer += chunk;
                onData?.(chunk); // stream as it's received

                if (!promptDetected && chunk.includes("__SHELL_READY__")) {
                    promptDetected = true;

                    this.shell!.stdout.off("data", onBootData); // switch handlers

                    // Clean up prompt buffer (remove marker line and echoes)
                    const cleaned = bootBuffer
                        .split("\n")
                        .filter((line) => !line.includes("__SHELL_READY__"))
                        .join("\n")
                        .trim();

                    // Start normal shell output handler
                    this.shell!.stdout.on("data", (data: Buffer) => {
                        const chunk = data.toString();
                        this.buffer += chunk;
                        onData?.(chunk);
                        this.processBuffer();
                    });

                    resolve(cleaned);
                }
            };

            this.shell!.stdout.on("data", onBootData);

            this.shell!.stderr.on("data", (data: Buffer) => {
                onError?.(data.toString());
            });

            this.shell!.on("close", (code) => {
                this.rejectAllPending(new Error("Shell closed"));
                this.shell = null;
                onExit?.(code);
                if (!promptDetected) {
                    reject(new Error("Shell exited before prompt appeared"));
                }
            });

            // Trigger prompt output
            this.shell!.stdin.write("echo __SHELL_READY__\n");
        });
    }



    async sendCommand(command: string): Promise<string> {
        if (!this.shell || this.shell.killed) throw new Error("Shell not started");

        const marker = `__END_${randomBytes(8).toString("hex")}__`;
        let output = "";
        let stderrOutput = "";

        return new Promise<string>((resolve, reject) => {
            const onData = (data: Buffer) => {
                const chunk = data.toString();
                output += chunk;

                if (chunk.includes(marker)) {
                    this.shell!.stdout.off("data", onData);
                    this.shell!.stderr.off("data", onStderr);

                    const cleaned = output
                        .split('\n')
                        .filter(line => !line.includes(marker) && line.trim() !== command.trim())
                        .join('\n')
                        .trim();

                    // Resolve output even if there's stderr
                    resolve(cleaned || stderrOutput.trim());
                }
            };

            const onStderr = (data: Buffer) => {
                const chunk = data.toString();
                stderrOutput += chunk;

                // Still stream errors if needed
                console.error("[stderr]", chunk); // or: this.onError?.(chunk)
            };

            const onExit = (code: number | null) => {
                this.shell!.stdout.off("data", onData);
                this.shell!.stderr.off("data", onStderr);
                this.shell!.off("exit", onExit);

                if (stderrOutput.trim() && !output.includes(marker)) {
                    reject(new Error(stderrOutput.trim()));
                } else if (!output.trim()) {
                    reject(new Error(`Shell exited with code ${code}`));
                }
            };

            this.shell!.stdout.on("data", onData);
            this.shell!.stderr.on("data", onStderr);
            this.shell!.once("exit", onExit);

            this.shell!.stdin.write(`${command}\necho ${marker}\n`);
        });
    }

    async execute(command: string, onProgress?: (chunk: string) => void): Promise<{ text: string, status: boolean }> {
        if (!this.shell || this.shell.killed) throw new Error("Shell not started");

        const marker = `__END_${randomBytes(8).toString("hex")}__`;
        let stdoutBuffer = "";
        let stderrBuffer = "";

        return new Promise((resolve) => {
            const onData = (data: Buffer) => {
                const chunk = data.toString();
                stdoutBuffer += chunk;
                onProgress?.(stdoutBuffer);

                const markerIndex = stdoutBuffer.indexOf(marker);

                if (markerIndex !== -1) {
                    cleanupListeners();

                    // Get everything before the marker, but trim only trailing whitespace
                    const cleaned = stdoutBuffer.slice(0, markerIndex).replace(/\r?\n$/, "");

                    setTimeout(() => {
                        if (stderrBuffer.length) {
                            // If there was any stderr, prefer that (or merge both if desired)
                            resolve({ text: stderrBuffer.trim() || cleaned.trim(), status: false });
                        } else {
                            resolve({ text: cleaned.trim(), status: true });
                        }
                    }, 100);
                }
            };

            const onStderr = (data: Buffer) => {
                const chunk = data.toString();
                stderrBuffer += chunk;
                onProgress?.(chunk);
            };

            const onExit = (code: number | null) => {
                cleanupListeners();
                setTimeout(() => {
                    const fallback = stderrBuffer || stdoutBuffer || `Shell exited with code ${code}`;
                    resolve({ text: fallback.trim(), status: false });
                }, 100);
            };

            const cleanupListeners = () => {
                this.shell?.stdout.off("data", onData);
                this.shell?.stderr.off("data", onStderr);
                this.shell?.off("exit", onExit);
            };

            this.shell!.stdout.on("data", onData);
            this.shell!.stderr.on("data", onStderr);
            this.shell!.once("exit", onExit);

            this.shell!.stdin.write(`${command}\necho ${marker}\n`);
        });
    }

    private processBuffer() {
        while (this.pendingResolvers.length > 0) {
            const pending = this.pendingResolvers[0];
            const idx = this.buffer.indexOf(pending.marker);
            if (idx === -1) break;

            // Include everything before marker (exclude marker itself)
            const output = this.buffer.substring(0, idx).replace(/\r?\n$/, "");
            // Remove the output and marker from buffer
            this.buffer = this.buffer.substring(idx + pending.marker.length);

            // Remove echoed command lines and marker from output, if needed
            pending.resolve(output.trim());
            this.pendingResolvers.shift();
        }
    }

    private rejectAllPending(error: Error) {
        for (const p of this.pendingResolvers) {
            p.reject(error);
        }
        this.pendingResolvers = [];
    }

    cleanup(): void {
        if (this.shell && !this.shell.killed) {
            this.shell.stdin.end();
            this.shell.kill();
            this.shell = null;
        }
        this.rejectAllPending(new Error("Shell cleaned up"));
        this.buffer = "";
    }
}
