# RouterOS Firmware 1.4.0 Release Notes

## Overview

Firmware 1.4.0 represents a major leap forward for the OmniMesh family, delivering enhanced stability, stronger security, and intelligent new features that redefine home networking.

## Security Enhancements

First and foremost, this release patches three CVEs affecting the web administration interface (CVSS 7.5 and below). Additionally, WPA3 transition mode now enforces PMF by default on new networks. Moreover, the default admin password is now unique per device and printed on the label — a change that eliminates the factory-default attack vector entirely.

## Performance Improvements

The mesh backhaul has been reworked with dynamic channel selection, delivering up to 30% higher throughput in multi-node deployments. Furthermore, airtime fairness ensures legacy devices no longer slow down modern clients.

## New Features

- Guest network scheduling
- Per-device usage reports in the mobile app
- WAN failover with LTE USB dongles

## Upgrade Notes

It's important to note that firmware 1.4.0 performs a one-time mesh re-optimization after install; expect nodes to drop offline for up to three minutes.

With 1.4.0 installed, your network is faster and more secure than ever. Happy surfing!
