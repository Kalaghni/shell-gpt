// src/electron/preload.ts

import { contextBridge, ipcRenderer } from "electron";
import {ShellContent} from "../types/shell";
import {SettingValues} from "../types/settings";

export const backend = {
    setTheme: async (theme: "system" | "light" | "dark") => {
        await ipcRenderer.invoke('set-theme', theme);
    },
    start: async (GOAL: string, SHELL_TYPE: string): Promise<void|Error> => {
        return await ipcRenderer.invoke('shell-start', GOAL, SHELL_TYPE);
    },
    send: async (command: string) => {
        return await ipcRenderer.invoke('shell-send', command);
    },
    stop: async () => {
        await ipcRenderer.invoke('shell-stop');
    },
    onThemeChange: (callback: (theme: string) => void) => {
        ipcRenderer.on('system-theme', (_event, theme: string) => callback(theme));
    },
    offThemeChange: () => {
        ipcRenderer.removeAllListeners('on-system-theme');
    },
    onShell: (callback: (content: ShellContent) => void) => {
        ipcRenderer.on('shell-content', (_event, content: ShellContent) => callback(content));
    },
    offShell: () => {
        ipcRenderer.removeAllListeners('shell-content');
    },
    trueShell: async (command: string) => {
        return await ipcRenderer.invoke('true-shell', command);
    },
    saveSettings: async (settings: SettingValues) => {
        return await ipcRenderer.invoke('save-settings', settings);
    },
    getSettings: async () => {
        return await ipcRenderer.invoke('get-settings');
    }
};
contextBridge.exposeInMainWorld("backend", backend);