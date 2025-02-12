import { readdirSync } from "fs";
import path from "path";

const commands: Record<string, any> = {};

for (const file of readdirSync(import.meta.dir)) {
    if (file.endsWith(".ts") && file !== "index.ts") {
        const removeExtension = file.replace(".ts", "");
        commands[removeExtension] = await import(path.join(import.meta.dir, file));
    }
}

export { commands };