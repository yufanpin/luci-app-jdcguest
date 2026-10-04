# luci-app-jdcguest

Guest WiFi plugin for the **JDCloud RE-CS-02** (`jdcloud,re-cs-02`, Qualcomm IPQ6000),
targeting OpenWrt / ImmortalWrt snapshots with the `fw4` firewall backend.

One LuCI page: a hardware/status panel plus one settings form. Applying writes the
network, DHCP, firewall and wireless sections and rolls back if any commit fails.

## Why this is device-specific

This is not a generic guest-network wizard. Four traits of this board drive the
implementation, and each one is a bug you hit with a "generic" guest setup here:

| Trait on RE-CS-02 | What the plugin does about it |
| --- | --- |
| Three mac80211 PHYs: `radio0` 5 GHz ch100 (DFS), `radio1` 2.4 GHz, `radio2` 5 GHz ch36 (non-DFS) | Pins the 5 GHz guest SSID to a non-DFS radio. A guest SSID on `radio0` goes silent for tens of seconds after every boot while hostapd runs radar detection. If the only 5 GHz radio is DFS-capable, 5 GHz is skipped and the UI says so. |
| dnsmasq runs with `nonwildcard=1` | Registers the guest interface in `dhcp.@dnsmasq[0].interface` on apply. Without it the SSID beacons, clients associate, and no lease is ever handed out. |
| `fw4` / nftables | All firewall state goes through UCI `config zone` / `config rule`, which fw4 compiles. No iptables rule is written anywhere. |
| AP behind another router (`wan` on 192.168.10.x, LAN on 10.0.0.0/24) | The guest zone gets `masq=1` and a guest-to-wan forwarding, since guest traffic is NATed twice to reach the internet. Subnet candidates exclude 192.168.10.0/24 and 10.0.0.0/24. |

The status panel lists every detected radio with band, channel and DFS flag, so the
selection is visible rather than magic.

## Behaviour

- 2.4 GHz guest SSID on the detected 2 GHz radio, 5 GHz guest SSID on the detected
  non-DFS 5 GHz radio, WPA2-PSK (`psk2+ccmp`).
- Optional per-band client isolation (`isolate`).
- Guest zone: `input REJECT`, `forward REJECT`, `masq 1`, plus explicit DNS (53) and
  DHCP (67) accepts. Guests cannot reach the LAN.
- Guest subnet defaults to `auto`, picking the first candidate whose `/24` is unused by
  any existing interface. Override in CIDR form for a fixed range.
- A blank passphrase means keep the current one, so the SSID or subnet can be rotated
  without re-entering the key.
- `bridge_empty=1` keeps `br-guest` up before any radio associates, so dnsmasq is already
  listening when the first client joins.
- Each apply snapshots `/etc/config/{network,wireless,firewall,dhcp}` into
  `/tmp/.jdcguest-backup` and restores it if a `uci commit` fails.
- Apply reloads `firewall`, `network` and `wifi`. It never reboots.
- Clearing **Enable** and applying, or pressing **Remove guest network**, tears the guest
  network down and drops the dnsmasq listener registration.

## Layout

```
htdocs/luci-static/resources/view/jdcguest.js   LuCI view
root/etc/config/jdcguest                         form state
root/usr/libexec/rpcd/jdcguest                   apply / remove / status backend
root/usr/share/luci/menu.d/luci-app-jdcguest.json
root/usr/share/rpcd/acl.d/luci-app-jdcguest.json
po/zh_Hans/jdcguest.po
po/zh_Hant/jdcguest.po
```

## Install

Build the package against an OpenWrt tree, or add it as a package source in a feed, then
install `luci-app-jdcguest`. After install the page lives at
**Network > Guest Network**.

Consume it from `OpenWRT-CI` with:

```
UPDATE_PACKAGE "luci-app-jdcguest" "yufanpin/luci-app-jdcguest" "main"
```

in `Scripts/Packages.sh`, plus `CONFIG_PACKAGE_luci-app-jdcguest=y` in
`Config/GENERAL.txt`. The second field is `owner/repo` and must point at a repository
this tree is actually pushed to; the default branch is `main`.

## Scope and known limitations

- IPv4 only. No IPv6 ULA, no DHCPv6, no `ip6assign`. Guests get IPv4 plus NAT.
- Wireless only. The DSA ports `lan1`-`lan4` can be bridged into `br-guest` with
  `isolated` set, but the plugin does not expose that yet.
- No proxy integration. homeproxy/sing-box is active on this router, so guest traffic
  already follows whatever rules that stack installed. The plugin adds, removes and
  reorders no sing-box rule; guest egress is plain `wan` NAT.
- No wired guest port and no captive portal.

## License

Apache-2.0. See `LICENSE`.
