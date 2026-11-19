import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-pad">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="dialog-title">{title}</h2>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
        {footer && (
          <div
            className="flex justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: "var(--border-soft)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
