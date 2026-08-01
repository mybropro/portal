import { XMarkIcon, DocumentIcon } from "@/components/icons/lucide";
import type { Attachment } from "@/hooks/use-attachments";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Pending attachments, shown above the composer until the message is sent. */
export function AttachmentTray({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}) {
  if (!attachments.length) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => {
        const isImage = attachment.mime.startsWith("image/");
        return (
          <div
            key={attachment.id}
            className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted/30 py-1 pl-1 pr-7 text-xs"
          >
            {isImage ? (
              <img
                src={attachment.url}
                alt={attachment.name}
                className="size-8 rounded object-cover"
              />
            ) : (
              <span className="grid size-8 place-items-center rounded bg-muted text-muted-fg">
                <DocumentIcon className="size-4" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block max-w-36 truncate">{attachment.name}</span>
              <span className="block text-muted-fg">
                {formatSize(attachment.size)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(attachment.id)}
              aria-label={`Remove ${attachment.name}`}
              className="absolute right-1 top-1 grid size-5 place-items-center rounded text-muted-fg hover:bg-muted hover:text-fg"
            >
              <XMarkIcon className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
