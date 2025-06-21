
import {ChatGPTAPI, ChatGPTAPIOptions} from "chatgpt";
import * as process from "node:process";

function createAi(apiKey?: string, override: Partial<ChatGPTAPIOptions> = {}): ChatGPTAPI {
    return new ChatGPTAPI({
        apiKey: apiKey ?? process.env.OPENAI_API_KEY!,
        completionParams: {
            model: 'gpt-4',
            temperature: 0.5,
            top_p: 0.8
        },
        ...override
    });
}

export default createAi;