import { describe, expect, it } from "vitest";

import { pickNetworks } from "../scripts/network.mjs";

function ipv4(address, extra = {}) {
  return { address, family: "IPv4", internal: false, ...extra };
}

describe("pickNetworks", () => {
  it("выбирает домашнюю сеть и не отдаёт имена адаптеров", () => {
    const result = pickNetworks({
      "Wi-Fi": [ipv4("192.168.1.20")],
      "vEthernet (WSL)": [ipv4("172.20.0.1")],
      "VPN Adapter": [ipv4("26.10.0.5")],
      "VirtualBox Host-Only": [ipv4("192.168.56.1")],
    });

    expect(result.primary).toEqual({
      address: "192.168.1.20",
      url: "http://192.168.1.20:4173",
      kind: "lan",
    });
    expect(result.alternatives).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain("Wi-Fi");
    expect(JSON.stringify(result)).not.toContain("VPN Adapter");
  });

  it("предпочитает 192.168 и отбрасывает link-local/loopback", () => {
    const result = pickNetworks({
      Ethernet: [ipv4("10.1.2.3")],
      "Wi-Fi": [ipv4("192.168.0.42")],
      Loopback: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      Auto: [ipv4("169.254.10.20")],
    });
    expect(result.primary?.address).toBe("192.168.0.42");
    expect(result.alternatives.map((entry) => entry.address)).toEqual([
      "10.1.2.3",
    ]);
  });

  it("помечает VPN и виртуальные интерфейсы", () => {
    const result = pickNetworks({
      "My VPN": [ipv4("100.100.100.100")],
      Docker: [ipv4("172.17.0.1")],
      "Home LAN": [ipv4("192.168.10.2")],
    });
    expect(result.primary?.kind).toBe("lan");
    expect(result.alternatives.every((entry) => entry.kind !== "lan")).toBe(true);
  });

  it("возвращает null, если сетей нет", () => {
    expect(pickNetworks({})).toEqual({ primary: null, alternatives: [] });
  });
});
