/**
 * Выбор сети для игроков без привязки к конкретной машине.
 *
 * На вход — результат os.networkInterfaces(). На выход — обезличенные
 * primary/alternatives: только адрес, URL и тип. Имена адаптеров наружу
 * не отдаются.
 */

const VIRTUAL_NAME =
  /(vpn|tun|tap|radmin|virtualbox|vbox|vmware|vethernet|hyper-v|docker|wsl|tailscale|zerotier|loopback)/i;

function isPrivate(address) {
  if (address.startsWith("10.")) return true;
  if (address.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return true;
  return false;
}

function kindOf(name, address) {
  if (
    VIRTUAL_NAME.test(name) ||
    /^192\.168\.56\./.test(address)
  ) {
    return "virtual";
  }
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) {
    return "vpn";
  }
  return isPrivate(address) ? "lan" : "other";
}

function scoreOf(kind, address) {
  if (kind === "virtual") return 30;
  if (kind === "vpn") return 20;
  if (kind === "other") return 10;
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  return 2;
}

export function pickNetworks(interfaces, port = 4173) {
  const seen = new Set();
  const candidates = [];

  for (const [name, entries] of Object.entries(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      const family = entry?.family;
      if (family !== "IPv4" && family !== 4) continue;
      if (entry.internal) continue;
      const address = String(entry.address ?? "");
      if (!address || address.startsWith("127.")) continue;
      if (address.startsWith("169.254.")) continue;
      if (seen.has(address)) continue;
      seen.add(address);
      const kind = kindOf(name, address);
      candidates.push({
        address,
        url: `http://${address}:${port}`,
        kind,
        score: scoreOf(kind, address),
      });
    }
  }

  candidates.sort(
    (a, b) => a.score - b.score || a.address.localeCompare(b.address),
  );

  const [primary, ...rest] = candidates;
  return {
    primary: primary
      ? { address: primary.address, url: primary.url, kind: primary.kind }
      : null,
    alternatives: rest.map(({ address, url, kind }) => ({
      address,
      url,
      kind,
    })),
  };
}
