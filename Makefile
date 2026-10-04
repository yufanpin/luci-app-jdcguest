#
# Copyright (C) 2026 OpenWRT-CI contributors
#
# This is free software, licensed under the Apache License 2.0
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-jdcguest
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=OpenWRT-CI

LUCI_TITLE:=JDCloud RE-CS-02 Guest Network
LUCI_DESCRIPTION:=Device-tuned guest WiFi provisioning for the JDCloud RE-CS-02 \
	(IPQ6000 / qualcommax). Detects the three onboard radios, keeps the guest \
	network off DFS channels, repairs dnsmasq non-wildcard listener registration, \
	and stays inside the fw4/nftables firewall backend.
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-file +iwinfo +dnsmasq-base +firewall4
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
