import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

/** Accessible modal built on native <dialog> (focus trap + Esc for free). */
export function Modal({ open, onClose, onAfterClose, title, description, children, className }: {
  open: boolean;
  onClose: () => void;
  /** Runs once the close animation has finished and the contents unmounted. */
  onAfterClose?: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Keep the contents mounted briefly so the close animation has something to show.
  const [rendered, setRendered] = useState(open);
  const afterClose = useRef(onAfterClose);
  useEffect(() => {
    afterClose.current = onAfterClose;
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setRendered(false);
      afterClose.current?.();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="modal-title"
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-card p-0 text-card-foreground shadow-2xl",
        "backdrop:bg-[#0B132B]/55 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      {rendered && (
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 id="modal-title" className="text-xl font-bold">{title}</h2>
              {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
