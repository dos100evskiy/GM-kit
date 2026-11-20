import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface Props {
  value: string;
  size?: number;
}

export function QrCode({ value, size = 168 }: Props) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let active = true;
    setSvg("");
    void QRCode.toString(value, {
      type: "svg",
      margin: 1,
      width: size,
      errorCorrectionLevel: "M",
      color: { dark: "#14110e", light: "#ffffff" },
    })
      .then((markup) => {
        if (active) setSvg(markup);
      })
      .catch(() => {
        if (active) setSvg("");
      });
    return () => {
      active = false;
    };
  }, [size, value]);

  return (
    <div
      className="qr-wrap"
      style={{ width: size + 16, height: size + 16 }}
      aria-label={value}
      title={value}
    >
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <span className="qr-placeholder">QR</span>
      )}
    </div>
  );
}
