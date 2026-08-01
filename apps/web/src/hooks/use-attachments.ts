import { useCallback, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  /** data: URL — opencode reads the payload straight out of it. */
  url: string;
  size: number;
}

// The bytes travel inline in the prompt and stay in the conversation history,
// so every later turn re-sends them. Worth keeping a lid on.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE_RESIZE_ABOVE_BYTES = 1024 * 1024;
const IMAGE_MAX_EDGE = 1600;

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Not a decodable image"));
    img.src = url;
  });
}

/**
 * Phone photos are many megabytes of detail no model needs. Re-encode anything
 * large down to a sane edge length; fall back to the original if the browser
 * cannot decode it.
 */
async function shrinkImage(dataUrl: string, mime: string) {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.width, img.height));
    if (scale === 1) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const encoded = canvas.toDataURL(
      mime === "image/png" ? "image/png" : "image/jpeg",
      0.85,
    );
    return encoded.length < dataUrl.length ? encoded : dataUrl;
  } catch {
    return dataUrl;
  }
}

/**
 * Providers differ on what they take inline. xAI, for one, rejects any non-image
 * as inline data ("requires a URL or a Files API reference"), so a .csv sent
 * under its own mime fails the whole turn.
 *
 * opencode has a way through: a text/plain data URL is decoded server-side and
 * injected as text, so it never reaches the provider as a file at all. Anything
 * that decodes as text therefore goes as text/plain — the filename is carried
 * separately, so the model is still told what it was reading.
 *
 * Binary non-images (pdf, zip, …) have no such path and are sent as-is; whether
 * they work is up to the model.
 */
function asTextAttachment(dataUrl: string, mime: string) {
  if (mime.startsWith("image/")) return { mime, url: dataUrl };

  const comma = dataUrl.indexOf(",");
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  if (!payload) return { mime, url: dataUrl };

  try {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    // A NUL byte means binary; a strict decode rejects invalid UTF-8.
    if (bytes.includes(0)) return { mime, url: dataUrl };
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { mime: "text/plain", url: `data:text/plain;base64,${payload}` };
  } catch {
    return { mime, url: dataUrl };
  }
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const nextId = useRef(0);

  const addFiles = useCallback(async (files: Iterable<File>) => {
    const incoming = [...files];
    if (!incoming.length) return;

    const accepted: Attachment[] = [];
    for (const file of incoming) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(
          `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB — over the ${MAX_FILE_BYTES / 1024 / 1024}MB limit`,
        );
        continue;
      }

      try {
        const sourceMime = file.type || "application/octet-stream";
        let dataUrl = await readAsDataUrl(file);
        if (
          sourceMime.startsWith("image/") &&
          file.size > IMAGE_RESIZE_ABOVE_BYTES
        ) {
          dataUrl = await shrinkImage(dataUrl, sourceMime);
        }
        const { mime, url } = asTextAttachment(dataUrl, sourceMime);
        // Neither an image nor decodable as text, so it goes to the provider
        // as raw inline data — which some reject outright. Worth flagging,
        // because a rejected part stays in the history and fails every later
        // turn in the session too.
        if (!mime.startsWith("image/") && mime !== "text/plain") {
          toast.warning(
            `${file.name}: ${mime} is sent as-is — some models reject non-image files`,
          );
        }
        nextId.current += 1;
        accepted.push({
          id: `attachment-${nextId.current}`,
          // Pasted screenshots arrive without a name.
          name: file.name || `pasted-${sourceMime.split("/")[1] || "file"}`,
          mime,
          url,
          size: file.size,
        });
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }

    if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  return { attachments, addFiles, removeAttachment, clearAttachments };
}
