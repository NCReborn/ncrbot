// src/utils/attachmentLogger.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const IMAGE_DIR = "/home/container/spam-images";

function ensureDir() {
    if (!fs.existsSync(IMAGE_DIR)) {
        fs.mkdirSync(IMAGE_DIR, { recursive: true });
    }
}

/**
 * Downloads all attachments from a message and saves them locally.
 * Returns an array of { buffer, filename, savePath } for use in log messages.
 */
export async function saveMessageAttachments(message) {
    ensureDir();

    const savedFiles = [];

    for (const attachment of message.attachments.values()) {
        try {
            const res = await fetch(attachment.url);
            const buffer = Buffer.from(await res.arrayBuffer());

            const timestamp = Date.now();
            const safeName = attachment.name || "attachment";
            const filename = `${timestamp}-${safeName}`;
            const savePath = path.join(IMAGE_DIR, filename);

            fs.writeFileSync(savePath, buffer);

            savedFiles.push({ buffer, filename, savePath });
        } catch (err) {
            console.error("[AttachmentLogger] Failed to save attachment:", err);
        }
    }

    return savedFiles;
}
