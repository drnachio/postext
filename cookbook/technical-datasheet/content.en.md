---
title: "PX-7021 digital temperature sensor"
subtitle: "DS-7021 · Rev. 0.3"
author: "Pyxis Microdevices"
publishDate: "September 2026"
---

# PX-7021 {kicker="Digital temperature sensor" lead="±0.1 °C accuracy from 1.4 µA, with an I²C and SMBus interface, in a 2 × 2 mm package" k1="±0.1 °C" k1l="Accuracy, −20 °C to 50 °C" k2="1.4 µA" k2l="At one reading a second" k3="2 × 2 mm" k3l="8-pin DFN package"}

## Features {style="lead-in"}

- ±0.1 °C maximum error from −20 °C to 50 °C
- ±0.3 °C maximum error from −40 °C to 125 °C
- 16-bit result, with a resolution of 0.0078 °C
- 1.4 µA at one reading a second, 0.1 µA in shutdown
- Supply from 1.6 V to 5.5 V, 5.5 V-tolerant interface
- I²C and SMBus, from 1 kHz to 1 MHz, with bus timeout
- Eight bus addresses, selected by three pins
- Alert output, in comparator or interrupt mode
- 8-pin DFN, 2 × 2 mm, with an exposed pad (:ref{id="pinout" style="full"})

## Applications

- Cold-chain loggers for vaccines and fresh food
- Wearable and home thermometry
- Battery packs, chargers and power banks
- Thermostats and building controls
- Thermal protection for processors and power stages
- Laboratory and medical instruments

:::columnbreak

## Description

The PX-7021 is a digital temperature sensor for coin-cell designs that must read within a tenth of a degree. A 16-bit converter reads an on-chip bandgap sensor, and every part is trimmed at two temperatures on the production line, so the board needs no calibration and the host no look-up table: one step of the result is 1/128 °C.

Between conversions the sensor sleeps: at one reading a second it draws 1.4 µA on average. Two limit registers drive the open-drain :chip[ALERT] output, which can wake a sleeping host when the temperature leaves a window.

:ref{id="circuit" style="full"} shows the typical circuit, with one decoupling capacitor and the bus pull-ups. With its address pins tied to ground the sensor answers at 48h.

:chip[Preview]{style="preview"} Engineering samples of the DFN versions are available now. The limits in :ref{id="electrical" style="full"} are preliminary and may change before production release.

:::pagebreak

## Specifications

:::callout{type="ratings"}
- Supply voltage, *V*~DD~ to GND: **−0.3 V to 6 V**
- SDA, SCL and ALERT to GND: **−0.3 V to 6 V**
- A0 to A2 to GND: **−0.3 V to *V*~DD~ + 0.3 V**
- Current into any pin: **±10 mA**
- Storage temperature: **−60 °C to 150 °C**
- Electrostatic discharge, human-body model: **±2 kV**
:::

Stress beyond these ratings can damage the device for good. Design to the operating conditions below.

### Recommended operating conditions

Operate the sensor from 1.6 V to 5.5 V, at ambient temperatures from −40 °C to 125 °C, with less than 50 mV of ripple on the supply. The bus pull-ups may return to any supply up to 5.5 V, so a sensor run from 1.8 V can share a bus with 5 V parts without a level shifter.

### Electrical characteristics

:ref{id="electrical" style="full"} lists the limits over the full supply and temperature range. Typical values are the mean of the characterization lots at 3.3 V and 25 °C; they are not guaranteed. Accuracy is tested on every part at 25 °C and 50 °C; values marked ² come from characterization only.

## Pin configuration and functions

:ref{id="pinout" style="full"} shows the package from above. A dot on the top face marks pin 1, and the pins count counterclockwise from it. The exposed pad under the package is the sensor's thermal path to the board: solder it to a ground pour. :ref{id="pins" style="full"} describes each pin.

## Detailed description

A host talks to the PX-7021 through eleven registers, listed with their reset values in :ref{id="registers" style="full"}. Two-byte registers are read and written most significant byte first.

### Temperature conversion

A conversion takes 10.5 ms at 16 bits and 3.1 ms at 12 bits. In continuous mode the sensor starts a new conversion at the programmed rate, from one every four seconds to eight a second, and sleeps in between; in one-shot mode it converts once, stores the result and shuts down again. The result register always holds the last complete reading, so a read never catches a conversion halfway.

The result is a signed 16-bit value in steps of 1/128 °C. Values above 7FFFh are negative: 1900h reads as 50 °C, and E700h as −50 °C.

### Serial interface

The sensor is a target on an I²C or SMBus bus, at clock rates up to 1 MHz. Tie each of A0, A1 and A2 to ground or to the supply to choose one of eight addresses, from 48h to 4Fh. In SMBus mode a clock held low for more than 30 ms resets the interface, so a host that crashes in mid-transfer cannot lock the bus. The sensor also answers the I²C general-call reset command.

### Alert output

The :chip[ALERT] pin compares every result with the limits in THIGH and TLOW. In comparator mode it stays asserted while the temperature is above THIGH and releases once it falls below TLOW, which gives a thermostat its hysteresis. In interrupt mode it asserts once per crossing, and releases when the host reads STATUS, or when the sensor answers a read of the SMBus alert response address.

## Packaging and ordering

:ref{id="outline" style="full"} draws the package and its land pattern: the DFN-8 body is 2 mm square and 0.55 mm high, with a 0.5 mm pin pitch and a 0.8 × 1.5 mm exposed pad. :ref{id="ordering" style="full"} lists the versions and their order codes. The top of each part carries its number over a date code, YWWL: the year, the work week and the lot.

Parts are rated at moisture sensitivity level 1, so they need no dry storage, and survive three reflow cycles at a peak of 260 °C. Reflow shifts the reading by less than 0.02 °C.

## Layout guidelines

The sensor measures the copper under its exposed pad. For air temperature, place it at the edge of the board, away from regulators and processors, and cut slots in the board around it so that heat from the rest of the circuit reaches it slowly. For the temperature of a surface, do the opposite: a solid pour and a row of vias carry heat from the surface to the pad. Keep the decoupling capacitor on the same side of the board as the sensor and close to its supply pin: 2 mm at most.

## Revision history

**Rev. 0.3**, September 2026: preliminary release, with limits from the first characterization lots. Adds the WLCSP-4 version and the SMBus timeout.

**Rev. 0.2**, May 2026: advance information for early customers, with typical values only.

**Rev. 0.1**, February 2026: product brief, with the target accuracy and supply current.

:::paragraphs{style="colophon"}
A work of fiction: Pyxis Microdevices and the PX-7021 are imaginary, and so are these figures; do not design with them. Set in Fira Sans, Fira Sans Condensed and Fira Mono (SIL Open Font License) · Text and drawings: original, licensed CC BY 4.0.
:::
